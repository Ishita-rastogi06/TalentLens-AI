"""
TalentLens AI — FastAPI backend
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import fitz
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel

from scorer import calculate_score
from semantic_matcher import build_jd_semantic_cache
from jd_parser import parse_jd
from skill_extractor import extract_skills
from utils import extract_email, extract_name, extract_phone

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
# Resume scoring runs in parallel; the original detailed recruiter analysis is retained.
MAX_CONCURRENT_ANALYSES = 2
# Limit model output, not resume context: enough for a richer summary without asking
# Groq for an essay on every request.
GROQ_MAX_TOKENS = int(os.getenv("GROQ_MAX_TOKENS", "2200"))
GROQ_CONCURRENT_REQUESTS = int(os.getenv("GROQ_CONCURRENT_REQUESTS", "1"))
_groq_request_slots = threading.BoundedSemaphore(GROQ_CONCURRENT_REQUESTS)
_groq_spacing_lock = threading.Lock()
_last_groq_request_at = 0.0
GROQ_MIN_REQUEST_INTERVAL = float(os.getenv("GROQ_MIN_REQUEST_INTERVAL", "1.2"))
_configured_cors_origins = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()
]
CORS_ORIGINS = list(dict.fromkeys([
    *_configured_cors_origins,
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]))

api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key) if api_key else None

app = FastAPI(title="TalentLens AI Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    analysis: Optional[Union[dict, list]] = None


CHAT_CANNOT_ANSWER_REPLY = (
    "Sorry, I cannot answer this. Please ask something related to the resume, "
    "ATS score, skills, career advice, or candidate comparison."
)


def _is_useful_chat_question(message: str) -> bool:
    text = (message or "").strip().lower()
    if len(text) < 3:
        return False

    blocked_terms = re.search(
        r"\b(fuck|shit|bitch|nitch|asshole|bastard|chutiya|madarchod|bhenchod|bc|mc)\b",
        text,
        re.IGNORECASE,
    )
    if blocked_terms:
        return False

    letters = re.findall(r"[a-z]", text)
    vowels = re.findall(r"[aeiou]", text)
    words = re.findall(r"[a-z0-9]+", text)
    has_long_gibberish_token = any(len(word) >= 12 and not re.search(r"[aeiou]", word) for word in words)
    has_repeated_noise = re.search(r"(.)\1{5,}", text) is not None
    looks_mostly_symbols = len(letters) / max(len(text), 1) < 0.35
    domain_question = re.search(
        r"\b(what|why|how|who|which|when|where|compare|best|better|score|skill|skills|resume|ats|candidate|candidates|improve|improvement|career|job|rank|ranking|shortlist|strength|weakness|missing|match|matched|gap|gaps|select|hire|interview)\b",
        text,
    ) is not None

    if has_repeated_noise or has_long_gibberish_token or looks_mostly_symbols:
        return False
    if len(letters) >= 5 and not vowels:
        return False
    return domain_question


def _chat_fallback_reply(message: str, analysis: Any) -> str:
    """Local chatbot answer when Groq is unreachable."""
    question = (message or "").lower()

    if isinstance(analysis, list) and analysis:
        valid_candidates = [item for item in analysis if isinstance(item, dict)]
        if not valid_candidates:
            return "Run an analysis first, then I can compare candidates or explain the resume score."

        candidates = sorted(valid_candidates, key=lambda item: float(item.get("score") or 0), reverse=True)
        top = candidates[0]
        runner_up = candidates[1] if len(candidates) > 1 else None
        top_name = top.get("name") or top.get("resume_name") or "Top candidate"
        matched = ", ".join((top.get("matched_skills") or [])[:5]) or "the strongest available skill overlap"
        missing = ", ".join((top.get("missing_skills") or [])[:4]) or "no major listed gaps"

        if any(word in question for word in ("better", "best", "rank", "compare", "shortlist")):
            reply = [
                f"**Best Candidate: {top_name}**",
                f"- Score: {top.get('score', 0)}/100",
                f"- Verdict: {top.get('verdict') or 'Best current match'}",
                f"- Strongest match signals: {matched}",
                f"- Main gaps to verify: {missing}",
            ]
            if runner_up:
                runner_name = runner_up.get("name") or runner_up.get("resume_name") or "Second candidate"
                reply.append(f"- Next closest candidate: {runner_name} with {runner_up.get('score', 0)}/100")
            reply.append("\nChoose the top candidate if JD alignment is the main priority, then verify the listed gaps in screening.")
            return "\n".join(reply)

        return (
            f"**Quick Shortlist View:** {top_name} is currently leading with {top.get('score', 0)}/100. "
            f"Strong match signals: {matched}. Gaps to check: {missing}."
        )

    if isinstance(analysis, dict) and analysis:
        matched = ", ".join((analysis.get("matched_skills") or [])[:5]) or "limited direct skill overlap"
        missing = ", ".join((analysis.get("missing_skills") or [])[:4]) or "no major listed gaps"
        return (
            f"**Resume Snapshot**\n"
            f"- ATS Score: {analysis.get('score', 0)}/100\n"
            f"- Verdict: {analysis.get('verdict') or 'Needs Review'}\n"
            f"- Strong areas: {matched}\n"
            f"- Improve next: {missing}\n\n"
            "Add project or experience bullets that prove missing JD skills with tools, ownership, and measurable results."
        )

    return "Run an analysis first, then I can compare candidates or explain the resume score."


# ── Helpers ───────────────────────────────────────────────────────────────────

def _empty_analysis() -> Dict[str, Any]:
    return {
        "strengths": [],
        "weaknesses": [],
        "reasoning": "",
        "resume_summary": "",
        "improvements": [],
        "technical_strengths": [],
        "project_highlights": [],
        "industry_readiness": [],
        "missing_core_skills": [],
        "missing_production_experience": [],
        "resume_improvements": [],
        "ats_summary": "",
    }


def _clean_ai_list(value: Any) -> list[str]:
    items = value if isinstance(value, list) else [value]
    cleaned: list[str] = []
    for item in items:
        if isinstance(item, str):
            text = item.strip()
        elif isinstance(item, dict):
            text = str(
                item.get("strength")
                or item.get("weakness")
                or item.get("improvement")
                or item.get("text")
                or item.get("summary")
                or ""
            ).strip()
        else:
            text = ""
        if text:
            cleaned.append(text)
    return cleaned


def _normalise_recruiter_feedback(parsed: dict) -> Dict[str, Any]:
    """Map the richer recruiter schema into the existing frontend fields."""
    feedback = {**_empty_analysis(), **parsed}
    category_fields = (
        "technical_strengths",
        "project_highlights",
        "industry_readiness",
        "missing_core_skills",
        "missing_production_experience",
        "resume_improvements",
        "strengths",
        "weaknesses",
        "improvements",
    )
    for field in category_fields:
        feedback[field] = _clean_ai_list(feedback.get(field))

    feedback["ats_summary"] = str(feedback.get("ats_summary") or "").strip()
    feedback["resume_summary"] = str(feedback.get("resume_summary") or "").strip()
    feedback["reasoning"] = str(feedback.get("reasoning") or "").strip()

    recruiter_strengths = (
        feedback["technical_strengths"]
        + feedback["project_highlights"]
        + feedback["industry_readiness"]
    )
    recruiter_weaknesses = (
        feedback["missing_core_skills"]
        + feedback["missing_production_experience"]
    )

    if recruiter_strengths:
        feedback["strengths"] = recruiter_strengths
    if recruiter_weaknesses:
        feedback["weaknesses"] = recruiter_weaknesses
    if feedback["resume_improvements"]:
        feedback["improvements"] = feedback["resume_improvements"]
    if feedback["ats_summary"]:
        feedback["resume_summary"] = feedback["ats_summary"]

    if not feedback["ats_summary"] and feedback["resume_summary"]:
        feedback["ats_summary"] = feedback["resume_summary"]
    if not feedback["resume_improvements"] and feedback["improvements"]:
        feedback["resume_improvements"] = feedback["improvements"]

    return feedback


def _parse_ai_response(content: Optional[str]) -> Dict[str, Any]:
    if not content:
        return _empty_analysis()
    cleaned = content.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning("AI JSON parse failed: %s", exc)
        return _empty_analysis()
    return _normalise_recruiter_feedback(parsed) if isinstance(parsed, dict) else _empty_analysis()


def _valid_analysis(ai: Dict[str, Any]) -> bool:
    """Accept only complete recruiter feedback, never a truncated partial JSON response."""
    total_points = sum(
        len(_clean_ai_list(ai.get(field)))
        for field in ("strengths", "weaknesses", "improvements")
    )
    return bool(str(ai.get("resume_summary") or "").strip()) and total_points >= 3


async def _read_resume(file: UploadFile) -> Dict[str, str]:
    try:
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text = "".join(page.get_text() for page in doc)
        doc.close()
    except Exception as exc:
        logger.exception("Failed to read resume %s", file.filename)
        raise HTTPException(status_code=400, detail=f"Unable to read resume: {file.filename}") from exc

    name = extract_name(text) or os.path.splitext(file.filename)[0]
    return {"resume_name": file.filename, "name": name, "text": text}


def _call_groq(prompt: str, deadline: Optional[float] = None) -> Dict[str, Any]:
    if client is None:
        logger.warning("GROQ_API_KEY is not configured. Using criteria-based analysis fallback.")
        return _empty_analysis()

    remaining = 35.0 if deadline is None else max(0.0, deadline - time.monotonic())
    wait_time = min(25.0, remaining)
    if wait_time <= 0 or not _groq_request_slots.acquire(timeout=wait_time):
        logger.warning("Recruiter-feedback deadline reached before a Groq slot was available.")
        return _empty_analysis()
    try:
        global _last_groq_request_at
        with _groq_spacing_lock:
            elapsed = time.monotonic() - _last_groq_request_at
            if elapsed < GROQ_MIN_REQUEST_INTERVAL:
                time.sleep(GROQ_MIN_REQUEST_INTERVAL - elapsed)
            _last_groq_request_at = time.monotonic()

        remaining = 35.0 if deadline is None else max(0.0, deadline - time.monotonic())
        if remaining <= 0:
            return _empty_analysis()
        
        for attempt in range(3):
            try:
                response = client.chat.completions.create(
                    model=DEFAULT_MODEL,
                    messages=[
                        {"role": "system", "content": "You are a senior technical recruiter. Output ONLY valid JSON adhering strictly to the JSON schema."},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=GROQ_MAX_TOKENS,
                    timeout=min(22.0, remaining),
                )
                return _parse_ai_response(response.choices[0].message.content)
            except Exception as exc:
                error_text = str(exc).lower()
                retryable = any(token in error_text for token in ("429", "rate_limit", "timeout", "temporarily", "503", "502"))
                if retryable and attempt < 2:
                    delay = min(6.0, 1.5 * (attempt + 1))
                    logger.warning("Groq feedback call failed transiently. Retrying in %.1fs: %s", delay, exc)
                    time.sleep(delay)
                    remaining = 35.0 if deadline is None else max(0.0, deadline - time.monotonic())
                    if remaining > 0:
                        continue
                logger.warning("Groq candidate summary unavailable: %s", exc)
                return _empty_analysis()
        return _empty_analysis()
    finally:
        _groq_request_slots.release()


def _build_analysis_prompt(resume_text: str, jd_text: str, ats: dict) -> str:
    components = ats.get("score_components", {})
    semantic = ats.get("semantic_similarity", {})
    parsed_jd = ats.get("parsed_jd", {})

    top_covered = [
        r for r in ats.get("requirement_coverage", [])
        if r.get("match_type") in ("strong", "partial")
    ][:8]

    top_missing = [
        r for r in ats.get("requirement_coverage", [])
        if r.get("match_type") in ("weak", "missing") and r.get("weight", 0) >= 0.55
    ][:6]

    return f"""
You are an expert senior technical recruiter evaluating a candidate resume against a job description.

JOB DETAILS:
  Target Role: {parsed_jd.get("job_title", "Software Engineer")}
  Seniority: {parsed_jd.get("seniority", "unknown")}
  Experience Required: {parsed_jd.get("years_experience_required", "unspecified")} years

ATS FIT SUMMARY:
  Overall ATS Score: {ats["score"]}%  | Verdict: {ats["verdict"]}
  Skill Match Score: {components.get("skill_match", 0)}/35
  Requirement Coverage: {components.get("requirement_coverage", 0)}/30
  Experience Fit: {components.get("experience_fit", 0)}/20
  Profile Signals: {components.get("profile_signals", 0)}/15

DOCUMENT ALIGNMENT:
  Matched Skills: {", ".join(ats.get("matched_skills", [])) or "None"}
  Missing Skills: {", ".join(ats.get("missing_skills", [])) or "None"}

VERIFIED RESUME PASSAGES COVERING REQUIREMENTS:
{chr(10).join(f"  ✓ [{r.get('match_type', 'STRONG').upper()}] Requirement: {r.get('requirement') or r.get('text') or ''}" for r in top_covered) or "  None"}

HIGH-WEIGHT JD GAPS:
{chr(10).join(f"  ✗ [{r.get('match_type', 'MISSING').upper()}] Requirement: {r.get('requirement') or r.get('text') or ''}" for r in top_missing) or "  None"}

FULL CANDIDATE RESUME TEXT:
{resume_text[:6500]}

JOB DESCRIPTION:
{jd_text[:3000]}

════════════════════════════════
You MUST analyze the actual text of the resume and JD above.
Return ONLY valid JSON with this exact key structure:
{{
  "technical_strengths": [],
  "project_highlights": [],
  "industry_readiness": [],
  "missing_core_skills": [],
  "missing_production_experience": [],
  "resume_improvements": [],
  "ats_summary": ""
}}

GUIDELINES:

1. Technical Strengths
- Write polished recruiter-friendly points, not labels or fragments.
- Mention only verified technical skills that match the JD.
- Prioritize required technologies and explain why the evidence is useful.
- Avoid generic lines like "good communication", "hard worker", or "solid evidence".

2. Project Highlights
- Highlight projects that demonstrate practical application.
- Mention deployment, GitHub links, internships, or measurable outcomes.
- Prefer concrete proof: tools used, ownership, integrations, deployment, metrics, or real users.

3. Industry Readiness
- Evaluate education, certifications, internships, teamwork, and production exposure.
- Keep the tone balanced and professional.

4. Missing Core Skills
- List only required JD skills that are absent, weak, or not backed by enough resume proof.
- Phrase weaknesses as improvement areas, not harsh criticism.

5. Missing Production Experience
- Mention deployment, Docker, cloud, CI/CD, MLOps, scalability, monitoring, or production systems if missing.

6. Resume Improvements
- Provide actionable suggestions that would improve interview chances.

RULES:
- Do not hallucinate.
- Only use information present in the resume.
- Infer equivalent technologies where appropriate (e.g., FastAPI -> deployment, EC2 -> AWS).
- Prioritize quality over quantity.
- Return 3-4 strong points for technical_strengths and 3-4 useful points across missing_core_skills/missing_production_experience where possible.
- Keep each array point under 28 words.
- Every strength or weakness must sound ready to show directly to a student or recruiter.
- ats_summary must be a detailed 5-7 sentence paragraph explaining the candidate's fit and the main issues.
- Output MUST be strictly valid JSON. No markdown code block markers.
"""


def _ats_fallback_analysis(ats: dict) -> Dict[str, Any]:
    """Criteria-based fallback used only when the recruiter-feedback request is unavailable."""
    components = ats.get("score_components", {})
    features = ats.get("resume_features", {})
    requirements = ats.get("requirement_coverage", [])
    covered = [r.get("requirement", "") for r in requirements if r.get("match_type") in ("strong", "partial")]
    gaps = [r.get("requirement", "") for r in requirements if r.get("match_type") in ("weak", "missing")]

    projects = features.get("projects", {})
    experience = features.get("experience", {})
    education = features.get("education", {})
    certifications = features.get("certifications", {})
    quality = features.get("quality", {})

    strengths = []
    if covered:
        strengths.append(f"Shows JD-relevant capability in {covered[0]}, giving the recruiter a clear skill match to start from.")
    if projects.get("project_count", 0):
        project_text = f"Includes {projects['project_count']} technical project(s) that show practical application beyond coursework"
        if projects.get("deployed_projects", 0):
            project_text += ", including deployment or live proof"
        strengths.append(project_text + ".")
    if experience.get("internships", 0) or experience.get("full_time", 0) or experience.get("years", 0):
        strengths.append(
            f"Work exposure is visible through {experience.get('internships', 0)} internship(s), "
            f"{experience.get('full_time', 0)} full-time role signal(s), and {experience.get('years', 0)} stated year(s)."
        )
    if education.get("degree_found") or certifications.get("certification_count", 0):
        strengths.append(
            f"Academic and certification signals add credibility, with "
            f"{'a relevant degree' if education.get('degree_found') else 'resume education evidence'} "
            f"and {certifications.get('certification_count', 0)} certification(s)."
        )
    if not strengths:
        strengths.append("The resume has early technical signals, but the strongest proof should be made more visible for this JD.")

    matched_norm = [_normalise_term(skill) for skill in ats.get("matched_skills", [])]
    genuinely_unmatched_requirements = [
        gap for gap in gaps
        if not _mentions_matched_skill(gap, matched_norm)
    ]
    missing = ats.get("missing_skills", [])
    weaknesses = []
    if missing:
        weaknesses.append(f"JD-critical skills need clearer resume proof: {', '.join(missing[:3])}.")
    if len(missing) > 3:
        weaknesses.append(f"Additional required technologies are still weak or absent: {', '.join(missing[3:6])}.")
    for gap in genuinely_unmatched_requirements:
        if len(weaknesses) >= 3:
            break
        weaknesses.append(f"The resume should show a project, task, or measurable result connected to {gap}.")
    if components.get("experience_fit", 0) < 10:
        weaknesses.append("Experience depth appears below the JD target, so stronger ownership and impact details are needed.")
    if not projects.get("deployed_projects", 0):
        weaknesses.append("Projects would rank better with live links, GitHub proof, deployment details, or measurable outcomes.")
    weaknesses = weaknesses[:4] or ["The resume needs more JD-specific proof, especially tools used, project ownership, and measurable technical outcomes."]

    improvements = []
    if missing:
        improvements.append(f"Add bullet points demonstrating hands-on usage of: {', '.join(missing[:3])}.")
    for gap in genuinely_unmatched_requirements[:2]:
        improvements.append(f"Incorporate concrete project metrics illustrating: {gap}.")
    if not projects.get("deployed_projects", 0):
        improvements.append("Include GitHub links or live deployment URLs for key technical projects.")
    improvements.append("Quantify project impact with measurable outcomes (e.g. latency reduced, users served, efficiency gained).")

    matched = ats.get("matched_skills", [])
    missing = ats.get("missing_skills", [])
    covered_count = len([r for r in requirements if r.get("match_type") in ("strong", "partial")])
    total_requirements = len(requirements)

    primary_issue = (
        weaknesses[0]
        if weaknesses else
        "The main issue is that the resume does not make enough job-specific evidence easy to verify."
    )
    secondary_issue = (
        weaknesses[1]
        if len(weaknesses) > 1 else
        "Several achievements would be stronger if they included measurable outcomes, ownership details, and the exact tools used."
    )

    summary_parts = [
        f"The candidate earns an ATS match score of {ats.get('score', 0)}% with a '{ats.get('verdict', 'Needs Review')}' verdict, which means the resume is not yet presenting a convincing match for this JD.",
        (
            f"The strongest positive signals are the matched skills: {', '.join(matched[:5])}."
            if matched else
            "The resume has very limited explicit skill overlap with the job description, so the system cannot confidently connect the candidate's background to the role."
        ),
        (
            f"The requirement matcher found evidence for {covered_count} of {total_requirements} JD requirement(s), with the clearest covered point being: {covered[0]}."
            if covered and total_requirements else
            "The requirement matcher did not find enough strong resume passages for the most important JD requirements."
        ),
        f"The main issue with this candidate is: {primary_issue}",
        f"A second concern is: {secondary_issue}",
        (
            f"The profile includes {projects.get('project_count', 0)} project-related signal(s), "
            f"{experience.get('years', 0)} stated year(s) of experience, "
            f"{certifications.get('certification_count', 0)} certification signal(s), and "
            f"{sum(1 for value in quality.get('sections', {}).values() if value)} detected resume section(s)."
        ),
        (
            f"The biggest improvement area is adding clearer evidence for missing skills such as {', '.join(missing[:4])}."
            if missing else
            "The main improvement area is making existing impact more measurable with stronger metrics, deployment details, and business outcomes."
        ),
        "For a recruiter, this candidate should be treated as a possible but incomplete fit: the resume may contain useful background, but it needs clearer proof of JD-critical skills, stronger project detail, and more quantified impact before it can rank highly.",
    ]

    project_highlights = [s for s in strengths if "project" in s.lower() or "github" in s.lower() or "deployment" in s.lower()]
    industry_readiness = []
    if experience.get("internships", 0) or experience.get("full_time", 0) or experience.get("years", 0):
        industry_readiness.append(
            f"Industry signal: {experience.get('years', 0)} year(s), "
            f"{experience.get('internships', 0)} internship(s), and {experience.get('full_time', 0)} full-time role signal(s)."
        )
    if education.get("degree_found") or certifications.get("certification_count", 0):
        industry_readiness.append(
            f"Readiness signal: degree evidence is {bool(education.get('degree_found'))} and certification signals total {certifications.get('certification_count', 0)}."
        )

    production_keywords = ("deploy", "production", "docker", "cloud", "ci/cd", "mlops", "scalability", "monitoring")
    missing_production = [w for w in weaknesses if any(keyword in w.lower() for keyword in production_keywords)]
    missing_core = [w for w in weaknesses if w not in missing_production]

    return {
        "technical_strengths": strengths[:4],
        "project_highlights": project_highlights[:3],
        "industry_readiness": industry_readiness[:3],
        "missing_core_skills": missing_core[:4],
        "missing_production_experience": missing_production[:3],
        "resume_improvements": improvements[:5],
        "ats_summary": " ".join(summary_parts),
        "strengths": strengths[:4],
        "weaknesses": weaknesses,
        "improvements": improvements[:5],
        "resume_summary": " ".join(summary_parts),
        "reasoning": (
            f"Skill Match: {components.get('skill_match', 0)}/35; Requirement Coverage: "
            f"{components.get('requirement_coverage', 0)}/30; Experience Fit: "
            f"{components.get('experience_fit', 0)}/20; Profile Signals: "
            f"{components.get('profile_signals', 0)}/15."
        ),
    }


def _normalise_term(value: str) -> str:
    """Lower-case comparison form for skills shown to the recruiter."""
    return " ".join("".join(ch if ch.isalnum() or ch in "+#" else " " for ch in value.lower()).split())


def _mentions_matched_skill(text: str, matched_skills: list[str]) -> bool:
    text_norm = _normalise_term(text)
    return any(skill and re.search(r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])", text_norm) for skill in matched_skills)


def _reconcile_feedback_with_ats(ai: dict, ats: dict) -> dict:
    """Ensure AI feedback is retained while replacing only empty or invalid responses."""
    fallback = _ats_fallback_analysis(ats)
    stale_feedback_phrases = (
        "the candidate highlights",
        "relevant experience includes",
        "verified credentials include",
        "key technologies required by the jd not explicitly found",
        "additional missing technical requirements",
        "requires stronger resume evidence",
        "stated experience duration or seniority is below target",
        "specific technical experience detail can be enhanced",
    )

    def is_stale_or_generic(text: str) -> bool:
        lowered = text.lower()
        return any(phrase in lowered for phrase in stale_feedback_phrases)

    def consistent_text(value: Any, replacements: list[str], is_list: bool):
        items = value if is_list and isinstance(value, list) else [value]
        kept = []
        for item in items:
            if isinstance(item, str):
                text = item.strip()
                if text and not is_stale_or_generic(text):
                    kept.append(text)
        if is_list:
            return kept if len(kept) >= 1 else replacements
        return kept[0] if kept else replacements[0]

    ai["strengths"] = consistent_text(ai.get("strengths"), fallback["strengths"], True)
    ai["weaknesses"] = consistent_text(ai.get("weaknesses"), fallback["weaknesses"], True)
    ai["improvements"] = consistent_text(ai.get("improvements"), fallback["improvements"], True)
    for field in (
        "technical_strengths",
        "project_highlights",
        "industry_readiness",
        "missing_core_skills",
        "missing_production_experience",
        "resume_improvements",
    ):
        ai[field] = consistent_text(ai.get(field), fallback.get(field, []), True)
    ai["resume_summary"] = consistent_text(ai.get("resume_summary"), [fallback["resume_summary"]], False)
    if len(ai["resume_summary"].split()) < 90:
        ai["resume_summary"] = fallback["resume_summary"]
    ai["ats_summary"] = consistent_text(ai.get("ats_summary"), [ai["resume_summary"]], False)
    ai["reasoning"] = consistent_text(ai.get("reasoning"), [fallback["reasoning"]], False)
    return ai

def _build_ranking_result(rd: Dict[str, str], ats: dict, ai: dict) -> Dict[str, Any]:
    """Build the existing recruiter response item without changing its schema."""
    return {
        "name":                  rd["name"],
        "resume_name":           rd["resume_name"],
        "score":                 ats["score"],
        "confidence":            ats["confidence"],
        "verdict":               ats["verdict"],
        "matched_skills":        ats["matched_skills"],
        "missing_skills":        ats["missing_skills"],
        "skill_scores":          ats["skill_scores"],
        "score_breakdown":       ats["score_breakdown"],
        "resume_features":       ats["resume_features"],
        "semantic_similarity":   ats["semantic_similarity"],
        "score_components":      ats["score_components"],
        "requirement_coverage":  ats["requirement_coverage"],
        "parsed_jd":             ats["parsed_jd"],
        "strengths":             ai.get("strengths", []),
        "weaknesses":            ai.get("weaknesses", []),
        "improvements":          ai.get("improvements", []),
        "technical_strengths":   ai.get("technical_strengths", []),
        "project_highlights":    ai.get("project_highlights", []),
        "industry_readiness":    ai.get("industry_readiness", []),
        "missing_core_skills":   ai.get("missing_core_skills", []),
        "missing_production_experience": ai.get("missing_production_experience", []),
        "resume_improvements":   ai.get("resume_improvements", []),
        "ats_summary":           ai.get("ats_summary", ""),
        "resume_summary":        ai.get("resume_summary", ""),
        "reasoning":             ai.get("reasoning", ""),
        "email":                 extract_email(rd["text"]),
        "phone":                 extract_phone(rd["text"]),
        "resume_text":           rd["text"],
    }


def _score_ranking_candidate(
    rd: Dict[str, str], job_description: str, cached_jd_skills: list[str],
    cached_parsed_jd: dict, semantic_cache: dict,
) -> tuple[Dict[str, str], dict]:
    """CPU scoring phase; does not wait for recruiter feedback."""
    ats = calculate_score(rd["text"], job_description, cached_jd_skills=cached_jd_skills,
                          cached_parsed_jd=cached_parsed_jd, semantic_cache=semantic_cache)
    return rd, ats


def _add_recruiter_feedback(scored: tuple[Dict[str, str], dict], job_description: str, deadline: Optional[float] = None) -> Dict[str, Any]:
    """Detailed recruiter feedback phase; guarded independently from scoring."""
    rd, ats = scored
    ai = _call_groq(_build_analysis_prompt(rd["text"], job_description, ats), deadline)
    if not _valid_analysis(ai):
        ai = _ats_fallback_analysis(ats)
    ai = _reconcile_feedback_with_ats(ai, ats)
    return _build_ranking_result(rd, ats, ai)

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "groq_configured": client is not None,
        "model": DEFAULT_MODEL,
        "chat_fallback": True,
    }


@app.post("/analyze")
async def analyze_resume(
    resume: List[UploadFile] = File(...),
    job_description: str = Form(...),
):
    try:
        # A bounded batch window prevents runaway waits while still allowing
        # short Groq backoff when the API gets temporarily rate-limited.
        request_deadline = time.monotonic() + 75.0
        # Read PDFs concurrently; this does not change extracted text or response data.
        resumes = await asyncio.gather(*(_read_resume(f) for f in resume))

        # ── Multi-resume ranking ──────────────────────────────────────────
        if len(resumes) > 1:
            logger.info(
                "Analyzing %s resumes with %s concurrent workers. Caching JD data...",
                len(resumes),
                MAX_CONCURRENT_ANALYSES,
            )
            # Prepare JD data before candidate scoring. These can both call Groq, so
            # keep them sequential to avoid rate-limit bursts during repeated use.
            cached_parsed_jd = await asyncio.to_thread(parse_jd, job_description)
            cached_jd_skills = await asyncio.to_thread(extract_skills, job_description, use_groq=True)
            # Cache only immutable JD embeddings. Candidate embeddings and all scoring rules stay unchanged.
            semantic_cache = await asyncio.to_thread(
                build_jd_semantic_cache, job_description,
                cached_parsed_jd.get("requirements", []), cached_jd_skills,
            )
            scoring_slots = asyncio.Semaphore(MAX_CONCURRENT_ANALYSES)

            async def score_one(idx: int, rd: Dict[str, str]):
                async with scoring_slots:
                    logger.info("  Scoring resume %s/%s: %s", idx + 1, len(resumes), rd["name"])
                    return await asyncio.to_thread(
                        _score_ranking_candidate, rd, job_description, cached_jd_skills,
                        cached_parsed_jd, semantic_cache,
                    )

            # Start later local scoring while earlier recruiter feedback is waiting on Groq.
            score_tasks = [asyncio.create_task(score_one(i, rd)) for i, rd in enumerate(resumes)]

            async def feedback_one(task):
                try:
                    scored = await task
                    return await asyncio.to_thread(_add_recruiter_feedback, scored, job_description, request_deadline)
                except Exception as exc:
                    logger.exception("Error analyzing a resume: %s", exc)
                    raise HTTPException(status_code=500, detail=f"Error analyzing resume: {str(exc)}") from exc

            results = await asyncio.gather(*(feedback_one(task) for task in score_tasks))

            results.sort(key=lambda x: x["score"], reverse=True)
            for i, r in enumerate(results):
                r["rank"] = i + 1
            logger.info(f"Successfully analyzed {len(resumes)} resumes")
            return {"ranking": results}

        # ── Single resume (student) ───────────────────────────────────────
        logger.info("Analyzing single resume (student mode)")
        resume_text = resumes[0]["text"]
        ats = calculate_score(resume_text, job_description)
        ai = _call_groq(_build_analysis_prompt(resume_text, job_description, ats), request_deadline)
        if not _valid_analysis(ai):
            ai = _ats_fallback_analysis(ats)
        ai = _reconcile_feedback_with_ats(ai, ats)

        return {
            "analysis": {
                "score":                 ats["score"],
                "confidence":            ats["confidence"],
                "verdict":               ats["verdict"],
                "matched_skills":        ats["matched_skills"],
                "missing_skills":        ats["missing_skills"],
                "skill_scores":          ats["skill_scores"],
                "score_breakdown":       ats["score_breakdown"],
                "resume_features":       ats["resume_features"],
                "semantic_similarity":   ats["semantic_similarity"],
                "score_components":      ats["score_components"],
                "requirement_coverage":  ats["requirement_coverage"],
                "parsed_jd":             ats["parsed_jd"],
                "strengths":             ai.get("strengths", []),
                "weaknesses":            ai.get("weaknesses", []),
                "improvements":          ai.get("improvements", []),
                "technical_strengths":   ai.get("technical_strengths", []),
                "project_highlights":    ai.get("project_highlights", []),
                "industry_readiness":    ai.get("industry_readiness", []),
                "missing_core_skills":   ai.get("missing_core_skills", []),
                "missing_production_experience": ai.get("missing_production_experience", []),
                "resume_improvements":   ai.get("resume_improvements", []),
                "ats_summary":           ai.get("ats_summary", ""),
                "resume_summary":        ai.get("resume_summary", ""),
                "reasoning":             ai.get("reasoning", ""),
                "resume_text":           resume_text,
            }
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error in analyze: %s", exc)
        raise HTTPException(status_code=500, detail=f"Internal error: {str(exc)}") from exc


@app.post("/chat")
async def chat(req: ChatRequest):
    if not _is_useful_chat_question(req.message):
        return {"reply": CHAT_CANNOT_ANSWER_REPLY}

    context = (
        "You are analyzing multiple candidates for a recruiter. Compare when asked."
        if isinstance(req.analysis, list)
        else "You are helping a student understand their own resume analysis."
    )

    payload = (
        [
            {
                "name":               c.get("name"),
                "rank":               c.get("rank"),
                "score":              c.get("score"),
                "matched_skills":     c.get("matched_skills"),
                "missing_skills":     c.get("missing_skills"),
                "strengths":          c.get("strengths"),
                "weaknesses":         c.get("weaknesses"),
                "technical_strengths": c.get("technical_strengths"),
                "project_highlights": c.get("project_highlights"),
                "industry_readiness": c.get("industry_readiness"),
                "missing_core_skills": c.get("missing_core_skills"),
                "missing_production_experience": c.get("missing_production_experience"),
                "summary":            c.get("resume_summary"),
                "semantic_similarity": c.get("semantic_similarity"),
                "score_components":   c.get("score_components"),
            }
            for c in req.analysis
            if isinstance(c, dict)
        ]
        if isinstance(req.analysis, list)
        else req.analysis
    )

    prompt = f"""{context}

Resume Data:
{json.dumps(payload, indent=2)}

User Question:
{req.message}

Instructions:
- Clean formatted markdown with headings and bullet points.
- Be concise and factual.
- Do not invent information not in the data.
- Explain reasoning behind recommendations.
- Do not favor a candidate by list position.
"""

    if client is None:
        return {"reply": _chat_fallback_reply(req.message, req.analysis)}

    try:
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert career coach and technical recruiter."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=800,
            timeout=15.0,
        )
        return {"reply": response.choices[0].message.content or ""}
    except Exception as exc:
        logger.warning("Chatbot Groq call failed (%s): %s", type(exc).__name__, exc)
        return {"reply": _chat_fallback_reply(req.message, req.analysis)}
