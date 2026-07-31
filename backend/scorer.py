"""
ATS Scoring Engine

Scoring model inspired by how enterprise ATS platforms compute candidate fit:

  Score = Σ (requirement_i.weight × coverage_score_i) / Σ requirement_i.weight
          × 100   (weighted requirement coverage rate)

  Weighted by four pillar multipliers derived from the candidate's profile:
    1. Skill Coverage     — explicit skill token match rate           (35 pts)
    2. Requirement Coverage — passage-level semantic coverage         (30 pts)
    3. Experience Fit     — seniority alignment + years + roles       (20 pts)
    4. Profile Signals    — education, certs, projects, quality       (15 pts)

This is structurally equivalent to how Workday/Greenhouse rank candidates:
  they compute a weighted skill confidence vector and normalize it.

Key differences from simple keyword matching:
  - Weights come from the JD itself (Groq-parsed), not hardcoded numbers
  - Passage-level coverage catches paraphrased and contextual mentions
  - Seniority mismatch applies a calibrated penalty
  - Score is a proper weighted mean, not sum of arbitrary points
"""

from __future__ import annotations

import logging
import re

from jd_parser import parse_jd, split_sections, build_skill_weights
from resume_features import extract_resume_features
from skill_extractor import extract_skills
from semantic_matcher import semantic_match, compute_section_similarity, requirement_coverage

logger = logging.getLogger(__name__)


# ── Seniority mapping ─────────────────────────────────────────────────────────

_SENIORITY_YEARS: dict[str, tuple[int, int]] = {
    "junior":  (0,  2),
    "mid":     (2,  5),
    "senior":  (5, 15),
    "lead":    (7, 20),
    "unknown": (0, 20),
}


def _seniority_penalty(jd_seniority: str, resume_years: int) -> float:
    """
    Returns a multiplier in [0.6, 1.0].
    No penalty if resume years fall within the expected range.
    Graduated penalty for mismatches (overqualified or underqualified).
    """
    lo, hi = _SENIORITY_YEARS.get(jd_seniority.lower(), (0, 20))

    if lo <= resume_years <= hi:
        return 1.0
    elif resume_years < lo:
        gap = lo - resume_years
        return max(0.60, 1.0 - gap * 0.12)  # underqualified penalty
    else:
        # Overqualified — mild penalty only (they could still do the job)
        gap = resume_years - hi
        return max(0.85, 1.0 - gap * 0.04)


# ── Skill coverage component (35 pts) ─────────────────────────────────────────

def _compute_skill_component(
    resume_text: str,
    jd_text: str,
    sem_matches: dict[str, str],
) -> tuple[float, list[str], list[str], dict[str, float], list[dict]]:
    """
    Returns:
        (earned_score_0_35, matched_skills, missing_skills, skill_scores, breakdown)
    """
    resume_skills = extract_skills(resume_text)
    jd_skills = extract_skills(jd_text, use_groq=True)
    sections = split_sections(jd_text)
    weights = build_skill_weights(jd_skills, sections)

    matched: list[str] = []
    missing: list[str] = []
    breakdown: list[dict] = []
    skill_scores: dict[str, float] = {}

    earned = 0.0
    total = sum(weights.get(s, 0.3) for s in jd_skills)

    for skill in jd_skills:
        w = weights.get(skill, 0.3)

        if skill in resume_skills:
            matched.append(skill)
            earned += w
            skill_scores[skill] = 100
            breakdown.append({"skill": skill, "status": "Exact Match", "points": f"+{round(w,2)}"})

        elif skill in sem_matches:
            matched.append(skill)
            earned += w * 0.82
            skill_scores[skill] = 82
            breakdown.append({
                "skill": skill,
                "status": f"Semantic Match → {sem_matches[skill]}",
                "points": f"+{round(w * 0.82, 2)}",
            })

        else:
            missing.append(skill)
            skill_scores[skill] = 0
            breakdown.append({"skill": skill, "status": "Missing", "points": f"-{round(w,2)}"})

    ratio = earned / max(total, 0.001)
    component_score = ratio * 35.0

    return component_score, matched, missing, skill_scores, breakdown


def _compute_skill_component_with_cached_jd(
    resume_text: str,
    jd_skills: list[str],
    sem_matches: dict[str, str],
    jd_text: str,
) -> tuple[float, list[str], list[str], dict[str, float], list[dict]]:
    """
    Same as _compute_skill_component but uses pre-extracted JD skills (for multi-resume batches)
    to avoid redundant Groq API calls.
    """
    resume_skills = extract_skills(resume_text)
    sections = split_sections(jd_text)
    weights = build_skill_weights(jd_skills, sections)

    matched: list[str] = []
    missing: list[str] = []
    breakdown: list[dict] = []
    skill_scores: dict[str, float] = {}

    earned = 0.0
    total = sum(weights.get(s, 0.3) for s in jd_skills)

    for skill in jd_skills:
        w = weights.get(skill, 0.3)

        if skill in resume_skills:
            matched.append(skill)
            earned += w
            skill_scores[skill] = 100
            breakdown.append({"skill": skill, "status": "Exact Match", "points": f"+{round(w,2)}"})

        elif skill in sem_matches:
            matched.append(skill)
            earned += w * 0.82
            skill_scores[skill] = 82
            breakdown.append({
                "skill": skill,
                "status": f"Semantic Match → {sem_matches[skill]}",
                "points": f"+{round(w * 0.82, 2)}",
            })

        else:
            missing.append(skill)
            skill_scores[skill] = 0
            breakdown.append({"skill": skill, "status": "Missing", "points": f"-{round(w,2)}"})

    ratio = earned / max(total, 0.001)
    component_score = ratio * 35.0

    return component_score, matched, missing, skill_scores, breakdown


# ── Requirement coverage component (30 pts) ───────────────────────────────────

def _compute_requirement_component(
    resume_text: str,
    parsed_jd: dict,
) -> tuple[float, list[dict]]:
    """
    Weighted mean of passage-level coverage scores across all JD requirements.
    Returns (earned_score_0_30, covered_requirements_list).
    """
    requirements = parsed_jd.get("requirements", [])
    if not requirements:
        return 0.0, []

    covered = requirement_coverage(resume_text, requirements)

    # Weighted mean coverage
    weight_sum = sum(r["weight"] for r in covered)
    weighted_coverage = sum(
        r["weight"] * r.get("coverage_score", 0.0)
        for r in covered
    )

    ratio = weighted_coverage / max(weight_sum, 0.001)
    component_score = ratio * 30.0

    return component_score, covered


# ── Experience fit component (20 pts) ─────────────────────────────────────────

def _compute_experience_component(
    features: dict,
    parsed_jd: dict,
    section_sim: dict,
) -> float:
    """
    Combines:
      - Experience section semantic similarity to JD  (up to 10 pts)
      - Internship/role/years signal from resume features (up to 6 pts)
      - Seniority alignment penalty                   (multiplier)
    """
    exp_features = features["experience"]
    jd_seniority = parsed_jd.get("seniority", "unknown")
    jd_years_req = int(parsed_jd.get("years_experience_required", 0))

    resume_years = exp_features.get("years", 0)
    has_fulltime = exp_features.get("full_time", 0)
    internships = exp_features.get("internships", 0)

    # Semantic experience alignment
    exp_sim = section_sim.get("experience_section", 0.0)
    semantic_score = exp_sim * 10.0

    # Profile signal score
    profile_score = min(has_fulltime * 3.0 + internships * 1.5 + min(resume_years * 0.5, 3.0), 6.0)

    raw = semantic_score + profile_score

    # Seniority calibration
    penalty = _seniority_penalty(jd_seniority, resume_years)
    calibrated = raw * penalty

    return min(calibrated, 20.0)


# ── Profile signals component (15 pts) ────────────────────────────────────────

def _compute_profile_component(features: dict, section_sim: dict) -> float:
    """
    Education, certifications, projects, resume quality.
    """
    edu = features["education"]["education_score"]       # 0–10
    certs = features["certifications"]["certification_score"]  # 0–5
    projects = features["projects"]["project_score"]    # 0–20
    quality = features["quality"]["quality_score"]       # 0–5

    # Normalise each to a 0–1 ratio then weight
    edu_component    = (edu / 10.0) * 5.0
    cert_component   = (certs / 5.0) * 3.0
    project_component = (projects / 20.0) * 5.0
    quality_component = (quality / 5.0) * 2.0

    return min(edu_component + cert_component + project_component + quality_component, 15.0)


# ── Master scoring function ────────────────────────────────────────────────────

def calculate_score(
    resume_text: str,
    jd_text: str,
    cached_jd_skills: list[str] | None = None,
    cached_parsed_jd: dict | None = None,
) -> dict:
    """
    Full ATS scoring pipeline.

    Returns a dict with:
      score, verdict, confidence,
      matched_skills, missing_skills, skill_scores, score_breakdown,
      resume_features, semantic_similarity, score_components,
      requirement_coverage (passage-level detail),
      parsed_jd (structured JD metadata)
    
    Args:
        resume_text: resume content
        jd_text: job description
        cached_jd_skills: if provided, skip JD skill extraction (for multi-resume batches)
        cached_parsed_jd: if provided, skip JD parsing (for multi-resume batches)
    """

    # ── Parse JD into structured requirements ──────────────────────
    if cached_parsed_jd:
        parsed_jd = cached_parsed_jd
    else:
        parsed_jd = parse_jd(jd_text)

    # ── Extract features & embeddings ──────────────────────────────
    features = extract_resume_features(resume_text)
    # In batch mode, reuse the already extracted JD skills. This prevents one
    # identical Groq JD-skill request per candidate while preserving the same
    # skill-match inputs used by the scoring component.
    sem_matches = semantic_match(
        resume_text,
        jd_text,
        cached_jd_skills=cached_jd_skills,
    )
    section_sim = compute_section_similarity(resume_text, jd_text)

    # ── Component 1: Skill coverage (35 pts) ───────────────────────
    if cached_jd_skills:
        skill_score, matched_skills, missing_skills, skill_scores, skill_breakdown = (
            _compute_skill_component_with_cached_jd(resume_text, cached_jd_skills, sem_matches, jd_text)
        )
    else:
        skill_score, matched_skills, missing_skills, skill_scores, skill_breakdown = (
            _compute_skill_component(resume_text, jd_text, sem_matches)
        )

    # ── Component 2: Requirement coverage (30 pts) ─────────────────
    req_score, covered_requirements = _compute_requirement_component(resume_text, parsed_jd)

    # ── Component 3: Experience fit (20 pts) ───────────────────────
    exp_score = _compute_experience_component(features, parsed_jd, section_sim)

    # ── Component 4: Profile signals (15 pts) ──────────────────────
    profile_score = _compute_profile_component(features, section_sim)

    # ── Final score ────────────────────────────────────────────────
    raw_score = skill_score + req_score + exp_score + profile_score
    final_score = min(round(raw_score), 100)

    # ── Verdict ────────────────────────────────────────────────────
    if final_score >= 85:
        verdict = "🟢 Excellent Match"
    elif final_score >= 70:
        verdict = "🟢 Strong Match"
    elif final_score >= 55:
        verdict = "🟡 Good Match"
    elif final_score >= 38:
        verdict = "🟠 Average Match"
    else:
        verdict = "🔴 Poor Match"

    jd_skills_count = len(cached_jd_skills) if cached_jd_skills else len(extract_skills(jd_text, use_groq=True))
    confidence = round(len(matched_skills) / max(jd_skills_count, 1) * 100)

    # Requirement coverage summary for the UI
    req_coverage_summary = [
        {
            "requirement": r["text"],
            "category": r["category"],
            "weight": r["weight"],
            "coverage": r.get("coverage_score", 0.0),
            "match_type": r.get("match_type", "missing"),
        }
        for r in covered_requirements
        # Only send high-signal items to keep payload small
        if r.get("match_type") in ("strong", "partial") or r["weight"] >= 0.6
    ]

    return {
        "score": final_score,
        "confidence": confidence,
        "verdict": verdict,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "skill_scores": skill_scores,
        "score_breakdown": skill_breakdown,
        "resume_features": features,
        "semantic_similarity": {
            "overall":            round(section_sim["overall"] * 100, 1),
            "skills_section":     round(section_sim["skills_section"] * 100, 1),
            "experience_section": round(section_sim["experience_section"] * 100, 1),
            "education_section":  round(section_sim.get("education_section", 0.0) * 100, 1),
        },
        "score_components": {
            "skill_match":             round(skill_score, 1),
            "requirement_coverage":    round(req_score, 1),
            "experience_fit":          round(exp_score, 1),
            "profile_signals":         round(profile_score, 1),
        },
        "requirement_coverage": req_coverage_summary,
        "parsed_jd": {
            "job_title":                parsed_jd.get("job_title", "Unknown"),
            "seniority":                parsed_jd.get("seniority", "unknown"),
            "years_experience_required": parsed_jd.get("years_experience_required", 0),
            "total_requirements":       len(parsed_jd.get("requirements", [])),
        },
    }
