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
from jd_parser import parse_jd
from skill_extractor import extract_skills
from utils import extract_email, extract_name, extract_phone

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
# CPU resume scoring can run in parallel. Groq calls themselves are deliberately
# serialized below because this account has a 6,000 tokens-per-minute limit.
MAX_CONCURRENT_ANALYSES = max(1, min(int(os.getenv("MAX_CONCURRENT_ANALYSES", "2")), 4))
GROQ_MAX_TOKENS = max(250, min(int(os.getenv("GROQ_MAX_TOKENS", "500")), 800))
GROQ_MAX_RETRIES = max(1, min(int(os.getenv("GROQ_MAX_RETRIES", "6")), 10))
_groq_request_lock = threading.Lock()
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _empty_analysis() -> Dict[str, Any]:
    return {
        "strengths": [],
        "weaknesses": [],
        "reasoning": "",
        "resume_summary": "",
        "improvements": [],
    }


def _parse_ai_response(content: Optional[str]) -> Dict[str, Any]:
    if not content:
        return _empty_analysis()
    cleaned = content.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning("AI JSON parse failed: %s", exc)
        return {**_empty_analysis(), "reasoning": cleaned or "Unable to parse analysis."}
    return {**_empty_analysis(), **parsed}


async def _read_resume(file: UploadFile) -> Dict[str, str]:
    try:
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except (RuntimeError, ValueError) as exc:
        logger.exception("Failed to read resume %s", file.filename)
        raise HTTPException(status_code=400, detail=f"Unable to read resume: {file.filename}") from exc

    text = "".join(page.get_text() for page in doc)
    name = extract_name(text) or os.path.splitext(file.filename)[0]
    return {"resume_name": file.filename, "name": name, "text": text}


def _retry_delay_seconds(error: Exception, attempt: int) -> float:
    """Use Groq's suggested wait when available, with a small safe backoff."""
    match = re.search(r"try again in\s+(\d+)\s*(ms|s)", str(error), re.IGNORECASE)
    if match:
        suggested = float(match.group(1)) / (1000 if match.group(2).lower() == "ms" else 1)
        return max(0.75, suggested + 0.25)
    return min(8.0, 0.75 * (2 ** attempt))


def _call_groq(prompt: str) -> Dict[str, Any]:
    if client is None:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured.")

    # Candidate scoring may run in worker threads, but only one request may use
    # Groq at once. This prevents concurrent requests from exceeding the TPM cap.
    with _groq_request_lock:
        for attempt in range(GROQ_MAX_RETRIES):
            try:
                response = client.chat.completions.create(
                    model=DEFAULT_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a senior technical recruiter with 15 years of experience.\n"
                                "Return ONLY valid JSON. No markdown. No code fences. No prose before or after."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=GROQ_MAX_TOKENS,
                    timeout=60,
                )
                return _parse_ai_response(response.choices[0].message.content)
            except Exception as exc:
                is_rate_limit = "rate_limit" in str(exc).lower() or "429" in str(exc)
                if is_rate_limit and attempt < GROQ_MAX_RETRIES - 1:
                    wait_seconds = _retry_delay_seconds(exc, attempt)
                    logger.warning(
                        "Groq rate limit reached; retrying in %.2f seconds (%s/%s).",
                        wait_seconds, attempt + 1, GROQ_MAX_RETRIES,
                    )
                    time.sleep(wait_seconds)
                    continue
                logger.exception("Groq API call failed: %s", exc)
                raise HTTPException(status_code=502, detail=f"Groq API error: {str(exc)}") from exc

    raise HTTPException(status_code=502, detail="Groq API retry limit reached.")

def _build_analysis_prompt(resume_text: str, jd_text: str, ats: dict) -> str:
    components = ats.get("score_components", {})
    semantic = ats.get("semantic_similarity", {})
    parsed_jd = ats.get("parsed_jd", {})

    # Top covered requirements for context
    top_covered = [
        r for r in ats.get("requirement_coverage", [])
        if r.get("match_type") in ("strong", "partial")
    ][:8]

    top_missing = [
        r for r in ats.get("requirement_coverage", [])
        if r.get("match_type") in ("weak", "missing") and r.get("weight", 0) >= 0.55
    ][:6]

    return f"""
You are evaluating a candidate for the role: {parsed_jd.get("job_title", "Software Engineer")}
Seniority level expected: {parsed_jd.get("seniority", "unknown")}
Years of experience required: {parsed_jd.get("years_experience_required", "unspecified")}

════════════════════════════════
ATS SCORE: {ats["score"]}%  |  Verdict: {ats["verdict"]}  |  Confidence: {ats["confidence"]}%
════════════════════════════════

SCORE COMPONENTS (out of 100):
  Skill Match Coverage      : {components.get("skill_match", 0)} / 35
  Requirement Coverage      : {components.get("requirement_coverage", 0)} / 30
  Experience Fit            : {components.get("experience_fit", 0)} / 20
  Profile Signals           : {components.get("profile_signals", 0)} / 15

SEMANTIC ALIGNMENT:
  Overall Document          : {semantic.get("overall", 0)}%
  Skills Section vs JD      : {semantic.get("skills_section", 0)}%
  Experience Section vs JD  : {semantic.get("experience_section", 0)}%

MATCHED SKILLS: {", ".join(ats.get("matched_skills", [])) or "None"}
MISSING SKILLS: {", ".join(ats.get("missing_skills", [])) or "None"}

TOP COVERED REQUIREMENTS (passage-level):
{chr(10).join(f"  ✓ [{r['match_type'].upper()}] {r['requirement']}" for r in top_covered) or "  None"}

HIGH-WEIGHT GAPS:
{chr(10).join(f"  ✗ [{r['match_type'].upper()}] {r['requirement']}" for r in top_missing) or "  None"}

RESUME FEATURES:
{json.dumps(ats.get("resume_features", {}), indent=2)}

FULL RESUME:
{resume_text[:2600]}

JOB DESCRIPTION:
{jd_text[:1400]}

════════════════════════════════
Return ONLY this JSON — no extra text:
{{
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "...", "..."],
  "improvements": ["...", "...", "...", "..."],
  "resume_summary": "...",
  "reasoning": "..."
}}

RULES:
- strengths (3–5 items): Specific technical depth, named projects/internships/certifications.
  Reference the semantic alignment scores where the candidate demonstrates contextual fit
  beyond keyword matching. Mention deployment, production experience, measurable impact.
- weaknesses (2–4 items): Genuine gaps identified from high-weight missing requirements.
  Be specific — name the exact missing technology or experience. Never say "consider adding".
- improvements (4–6 items): Actionable. Tell the candidate exactly what words/sections to
  add/rewrite. Reference specific missing skills and which JD section they come from.
  Include one tip about quantifying achievements.
- resume_summary (2–3 sentences): Recruiter-style. State their strongest qualification,
  current fit level, and one key gap.
- reasoning (2–3 sentences): Reference the score components. Explain why the score is what
  it is — cite semantic similarity, skill gaps, and experience alignment specifically.
- Do NOT invent projects or experience.
- Do NOT list skills verbatim as strengths/weaknesses.
- Return valid JSON only.
"""


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
        "resume_summary":        ai.get("resume_summary", ""),
        "reasoning":             ai.get("reasoning", ""),
        "email":                 extract_email(rd["text"]),
        "phone":                 extract_phone(rd["text"]),
        "resume_text":           rd["text"],
    }


def _analyze_ranking_candidate(
    rd: Dict[str, str],
    job_description: str,
    cached_jd_skills: list[str],
    cached_parsed_jd: dict,
) -> Dict[str, Any]:
    """Run one candidate's CPU scoring and Groq analysis outside the event loop."""
    ats = calculate_score(
        rd["text"],
        job_description,
        cached_jd_skills=cached_jd_skills,
        cached_parsed_jd=cached_parsed_jd,
    )
    ai = _call_groq(_build_analysis_prompt(rd["text"], job_description, ats))
    return _build_ranking_result(rd, ats, ai)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "groq_configured": client is not None,
        "model": DEFAULT_MODEL,
    }


@app.post("/analyze")
async def analyze_resume(
    resume: List[UploadFile] = File(...),
    job_description: str = Form(...),
):
    try:
        # Read PDFs concurrently; this does not change extracted text or response data.
        resumes = await asyncio.gather(*(_read_resume(f) for f in resume))

        # ── Multi-resume ranking ──────────────────────────────────────────
        if len(resumes) > 1:
            logger.info(
                "Analyzing %s resumes with %s concurrent workers. Caching JD data...",
                len(resumes),
                MAX_CONCURRENT_ANALYSES,
            )
            cached_parsed_jd = await asyncio.to_thread(parse_jd, job_description)
            cached_jd_skills = await asyncio.to_thread(
                extract_skills, job_description, use_groq=False
            )
            semaphore = asyncio.Semaphore(MAX_CONCURRENT_ANALYSES)

            async def analyze_one(idx: int, rd: Dict[str, str]) -> Dict[str, Any]:
                async with semaphore:
                    try:
                        logger.info("  Resume %s/%s: %s", idx + 1, len(resumes), rd["name"])
                        return await asyncio.to_thread(
                            _analyze_ranking_candidate,
                            rd,
                            job_description,
                            cached_jd_skills,
                            cached_parsed_jd,
                        )
                    except Exception as exc:
                        logger.exception("Error analyzing resume %s: %s", rd["name"], exc)
                        raise HTTPException(
                            status_code=500,
                            detail=f"Error analyzing {rd['name']}: {str(exc)}",
                        ) from exc

            # gather preserves input order; the existing stable score sort therefore
            # keeps tie-ranking behavior unchanged.
            results = await asyncio.gather(
                *(analyze_one(idx, rd) for idx, rd in enumerate(resumes))
            )

            results.sort(key=lambda x: x["score"], reverse=True)
            for i, r in enumerate(results):
                r["rank"] = i + 1
            logger.info(f"Successfully analyzed {len(resumes)} resumes")
            return {"ranking": results}

        # ── Single resume (student) ───────────────────────────────────────
        logger.info("Analyzing single resume (student mode)")
        resume_text = resumes[0]["text"]
        ats = calculate_score(resume_text, job_description)
        ai = _call_groq(_build_analysis_prompt(resume_text, job_description, ats))

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
                "summary":            c.get("resume_summary"),
                "semantic_similarity": c.get("semantic_similarity"),
                "score_components":   c.get("score_components"),
            }
            for c in req.analysis
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
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured.")

    response = client.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": "You are an expert career coach and technical recruiter."},
            {"role": "user", "content": prompt},
        ],
    )
    return {"reply": response.choices[0].message.content or ""}
