"""
JD Parser — extracts structured requirements from a job description.

Two-stage approach (mirrors commercial ATS behaviour):
  1. Groq LLM: parse the JD into typed requirement objects with importance labels.
  2. Regex fallback: if Groq is unavailable, derive requirements from section headers.

Each requirement carries:
  - text        : the raw requirement phrase
  - category    : "required" | "preferred" | "nice_to_have"
  - skill_type  : "technical" | "domain" | "soft" | "experience" | "education"
  - weight      : float 0–1  (relative importance inferred from JD language)
"""

from __future__ import annotations

import json
import logging
import os
import re
from copy import deepcopy
from functools import lru_cache
from typing import Optional

from scoring_cache import get_cached, set_cached

logger = logging.getLogger(__name__)


# ── Groq client (imported lazily to avoid circular deps) ──────────────────────

def _get_client():
    try:
        from groq import Groq
        from dotenv import load_dotenv
        load_dotenv()
        api_key = os.getenv("GROQ_API_KEY")
        return Groq(api_key=api_key) if api_key else None
    except Exception:
        return None


# ── Groq-powered JD analysis ─────────────────────────────────────────────────

_JD_PARSE_PROMPT = """
You are an expert recruiter and HR analyst.

Parse the following Job Description into structured requirements.

Return ONLY valid JSON — no prose, no code fences — in this exact schema:

{{
  "job_title": "...",
  "seniority": "junior | mid | senior | lead | unknown",
  "years_experience_required": 0,
  "requirements": [
    {{
      "text": "requirement phrase as written in the JD",
      "category": "required | preferred | nice_to_have",
      "skill_type": "technical | domain | soft | experience | education",
      "weight": 0.0
    }}
  ]
}}

Weight rules:
- Required technical skills:               0.80 – 1.00
- Required experience / must-have:         0.70 – 0.85
- Preferred / bonus technical skills:      0.40 – 0.60
- Nice-to-have / plus / good-to-have:      0.15 – 0.35
- Education requirements (degree etc):     0.30 – 0.60
- Soft skills when explicitly required:    0.20 – 0.40

Assign higher weights to skills mentioned multiple times or with urgency language
("must", "essential", "required", "mandatory").
Assign lower weights to skills prefaced with "preferred", "nice to have", "bonus", "plus".

Extract EVERY distinct requirement, including:
- Specific technologies, languages, frameworks
- Years of experience clauses ("3+ years of Python")
- Degree requirements
- Domain knowledge ("fintech", "healthcare", "e-commerce")
- Soft skills if explicitly stated

Job Description:
{jd_text}
"""


def parse_jd_with_groq(jd_text: str) -> Optional[dict]:
    """
    Returns structured JD data or None if Groq is unavailable.
    """
    client = _get_client()
    if client is None:
        logger.warning("Groq client not initialized.")
        return None

    model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a precise JSON generator. "
                        "Return ONLY valid JSON. No markdown. No explanations."
                    ),
                },
                {
                    "role": "user",
                    "content": _JD_PARSE_PROMPT.format(jd_text=jd_text),
                },
            ],
            temperature=0.0,
            # A slow provider must not hold the complete recruiter request hostage.
            timeout=13,
        )
        raw = resp.choices[0].message.content or ""
        raw = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
        logger.info("JD parsed successfully with Groq")
        return parsed
    except json.JSONDecodeError as exc:
        logger.warning("JD Groq response was not valid JSON: %s. Using fallback.", exc)
        return None
    except Exception as exc:
        logger.warning("JD Groq parse failed (%s): %s. Using fallback.", type(exc).__name__, exc)
        return None


# ── Regex fallback section splitter (kept for offline use) ───────────────────

_SECTION_HEADERS = {
    "required": [
        "requirements", "required skills", "must have",
        "mandatory", "minimum qualifications", "required qualifications",
        "what we need", "what you need",
    ],
    "preferred": [
        "preferred", "nice to have", "good to have",
        "preferred qualifications", "bonus", "plus",
        "would be great", "desired",
    ],
    "responsibilities": [
        "responsibilities", "what you'll do", "job responsibilities",
        "role", "duties", "what you will do", "your role",
    ],
}

_CATEGORY_WEIGHT = {
    "required": 0.85,
    "responsibilities": 0.60,
    "preferred": 0.40,
    "general": 0.50,
    "unknown": 0.30,
}


def _split_sections(jd: str) -> dict[str, str]:
    jd_lower = jd.lower()
    jd_lower = re.sub(r"\r", "", jd_lower)
    current = "general"
    sections: dict[str, str] = {"general": ""}

    for line in jd_lower.split("\n"):
        clean = line.strip()
        if not clean:
            continue
        switched = False
        for section, headers in _SECTION_HEADERS.items():
            for header in headers:
                if header in clean:
                    current = section
                    sections.setdefault(current, "")
                    switched = True
                    break
            if switched:
                break
        if not switched:
            sections[current] += clean + "\n"
    return sections


def _regex_fallback_requirements(jd_text: str) -> list[dict]:
    """
    Extracts bullet-point lines from each section and turns them into
    requirement objects with heuristic weights.
    """
    sections = _split_sections(jd_text)
    requirements = []

    for section, text in sections.items():
        category_map = {
            "required": "required",
            "preferred": "preferred",
            "responsibilities": "required",
            "general": "required",
            "unknown": "nice_to_have",
        }
        category = category_map.get(section, "preferred")
        weight = _CATEGORY_WEIGHT.get(section, 0.4)

        for line in text.split("\n"):
            line = line.strip().lstrip("-•*·").strip()
            if len(line) > 8:
                requirements.append(
                    {
                        "text": line,
                        "category": category,
                        "skill_type": "technical",
                        "weight": weight,
                    }
                )

    return requirements


# ── Public API ────────────────────────────────────────────────────────────────

@lru_cache(maxsize=128)
def _parse_jd_cached(jd_text: str) -> dict:
    """
    Returns:
    {
        "job_title": str,
        "seniority": str,
        "years_experience_required": int,
        "requirements": [ { text, category, skill_type, weight }, ... ]
    }
    """
    persisted = get_cached("jd_parse", jd_text)
    if isinstance(persisted, dict) and isinstance(persisted.get("requirements"), list):
        return persisted

    parsed = parse_jd_with_groq(jd_text)

    if parsed and isinstance(parsed.get("requirements"), list) and len(parsed["requirements"]) > 0:
        normalized_reqs = []
        for req in parsed["requirements"]:
            if isinstance(req, dict):
                text_val = str(req.get("text") or req.get("requirement") or req.get("description") or "").strip()
                if text_val:
                    req["text"] = text_val
                    req["category"] = str(req.get("category") or "required").lower()
                    req["skill_type"] = str(req.get("skill_type") or "technical").lower()
                    try:
                        req["weight"] = max(0.1, min(1.0, float(req.get("weight", 0.5))))
                    except Exception:
                        req["weight"] = 0.5
                    normalized_reqs.append(req)
        if normalized_reqs:
            parsed["requirements"] = normalized_reqs
            set_cached("jd_parse", jd_text, parsed)
            return parsed

    # Fallback
    logger.info("Using regex fallback for JD parsing.")
    fallback = {
        "job_title": "Unknown",
        "seniority": "unknown",
        "years_experience_required": 0,
        "requirements": _regex_fallback_requirements(jd_text),
    }
    return fallback


def parse_jd(jd_text: str) -> dict:
    """Parse each exact JD once per backend process to keep scoring stable."""
    return deepcopy(_parse_jd_cached(jd_text))


# ── Legacy compatibility (used by scorer.py internals) ───────────────────────

def split_sections(jd: str) -> dict[str, str]:
    return _split_sections(jd)


def build_skill_weights(jd_skills: list[str], sections: dict[str, str]) -> dict[str, float]:
    """
    Maps extracted skill names → weights using section membership.
    Legacy interface kept for compatibility.
    """
    weights: dict[str, float] = {}
    for skill in jd_skills:
        if skill in sections.get("required", ""):
            weights[skill] = 0.85
        elif skill in sections.get("responsibilities", ""):
            weights[skill] = 0.60
        elif skill in sections.get("preferred", ""):
            weights[skill] = 0.40
        elif skill in sections.get("general", ""):
            weights[skill] = 0.50
        else:
            weights[skill] = 0.30
    return weights
