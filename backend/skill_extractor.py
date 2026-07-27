"""
Skill Extractor

Hybrid approach that mirrors commercial ATS skill detection:
  1. Regex/pattern matching against a broad canonical skill taxonomy
  2. Synonym resolution via the SKILL_SYNONYMS taxonomy
  3. Groq-assisted extraction for free-text JD requirements
     (so the system is never limited to a hardcoded vocabulary)

The canonical SKILLS list is the union of O*NET tech occupations and
common software engineering job posting terminology.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional

from synonyms import SKILL_SYNONYMS

logger = logging.getLogger(__name__)


# ── Canonical skill vocabulary ────────────────────────────────────────────────
# Covers the vast majority of tech JDs without being exhaustive.
# Groq extraction fills any gaps for domain-specific or emerging skills.

SKILLS: list[str] = [
    # Languages
    "python", "java", "javascript", "typescript", "c", "c++", "c#",
    "go", "rust", "php", "ruby", "scala", "kotlin", "swift", "r",
    "matlab", "perl", "shell", "bash", "html", "css",

    # AI / ML
    "machine learning", "deep learning", "artificial intelligence",
    "nlp", "computer vision", "reinforcement learning", "llm",
    "tensorflow", "keras", "pytorch", "scikit-learn",
    "xgboost", "lightgbm", "hugging face", "langchain",
    "openai", "mlflow", "kubeflow",

    # Data
    "sql", "mysql", "postgresql", "sqlite", "mssql", "oracle",
    "mongodb", "redis", "cassandra", "elasticsearch",
    "snowflake", "bigquery", "redshift", "databricks",
    "spark", "hadoop", "kafka", "airflow", "dbt",
    "numpy", "pandas", "matplotlib", "seaborn", "plotly",
    "tableau", "power bi", "excel",

    # Backend
    "fastapi", "flask", "django", "spring", "node.js", "express",
    "nestjs", "graphql", "rest api", "grpc", "celery", "rabbitmq",

    # Frontend
    "react", "angular", "vue", "next.js", "svelte",
    "html", "css", "tailwind", "redux", "webpack",

    # Cloud
    "aws", "azure", "gcp", "serverless",

    # DevOps / MLOps
    "docker", "kubernetes", "jenkins", "terraform", "ansible",
    "github actions", "gitlab ci", "ci/cd",
    "prometheus", "grafana", "datadog", "nginx",

    # Tools & Practices
    "git", "linux", "agile", "jira",
    "system design", "microservices", "api design",
    "testing", "data structures",
    "cybersecurity", "oauth",
]


# ── Text normalisation ────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9+#./\-\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _contains(text: str, skill: str) -> bool:
    escaped = re.escape(skill)
    return bool(re.search(rf"\b{escaped}\b", text))


# ── Regex + synonym matching ──────────────────────────────────────────────────

def extract_skills_regex(text: str) -> list[str]:
    """
    Extract skills from text using canonical list + synonym expansion.
    Always works offline.
    """
    norm = _normalize(text)
    found: set[str] = set()

    for skill in SKILLS:
        if _contains(norm, skill):
            found.add(skill)

    for canonical, aliases in SKILL_SYNONYMS.items():
        if canonical in found:
            continue
        for alias in aliases:
            if _contains(norm, _normalize(alias)):
                found.add(canonical)
                break

    return sorted(found)


# ── Groq-assisted skill extraction ───────────────────────────────────────────

_SKILL_PROMPT = """
You are a precise skill extractor for an Applicant Tracking System.

Extract ALL technical skills, tools, frameworks, languages, platforms, and domain
knowledge from the text below.

Return ONLY valid JSON — no prose, no code fences:
{{
  "skills": ["skill1", "skill2", ...]
}}

Rules:
- Normalise to lowercase canonical forms (e.g. "Python", "PYTHON" → "python").
- Exclude vague soft skills ("communication", "teamwork") unless they are explicitly
  listed as requirements.
- Include domain knowledge ("fintech", "healthcare", "computer vision") if present.
- Include experience-level phrases as a single token when skill-specific
  (e.g. "3+ years python" → include "python"; do NOT include the years clause itself).
- Do NOT invent skills not present in the text.

Text:
{text}
"""


def _get_groq_client():
    try:
        from groq import Groq
        from dotenv import load_dotenv
        load_dotenv()
        api_key = os.getenv("GROQ_API_KEY")
        return Groq(api_key=api_key) if api_key else None
    except Exception:
        return None


def extract_skills_groq(text: str) -> list[str]:
    """
    Use Groq to extract skills that the regex pass may miss
    (domain-specific, emerging, or unusual naming).
    Returns empty list on any failure — graceful degradation.
    """
    client = _get_groq_client()
    if client is None:
        return []

    model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "Return ONLY valid JSON. No markdown. No code fences.",
                },
                {
                    "role": "user",
                    "content": _SKILL_PROMPT.format(text=text[:4000]),
                },
            ],
            temperature=0.0,
            timeout=30,
        )
        raw = resp.choices[0].message.content or ""
        raw = raw.replace("```json", "").replace("```", "").strip()
        data = json.loads(raw)
        skills = [s.strip().lower() for s in data.get("skills", []) if isinstance(s, str)]
        return skills
    except Exception as exc:
        logger.debug("Groq skill extraction failed (%s): %s", type(exc).__name__, exc)
        return []


# ── Public interface ──────────────────────────────────────────────────────────

def extract_skills(text: str, use_groq: bool = False) -> list[str]:
    """
    Primary extraction entry point.

    Args:
        text:      raw text (resume or JD)
        use_groq:  if True, merge Groq results for richer coverage.
                   For JD parsing this should be True; for resumes optional.
    """
    regex_skills = extract_skills_regex(text)

    if not use_groq:
        return regex_skills

    groq_skills = extract_skills_groq(text)

    # Merge: canonicalise Groq results through synonym map
    norm_regex = set(regex_skills)
    for gs in groq_skills:
        gs_norm = _normalize(gs)
        # Check if it resolves to a known canonical
        resolved = False
        for canonical, aliases in SKILL_SYNONYMS.items():
            if gs_norm == _normalize(canonical) or gs_norm in [_normalize(a) for a in aliases]:
                norm_regex.add(canonical)
                resolved = True
                break
        if not resolved and gs_norm and len(gs_norm) > 1:
            norm_regex.add(gs_norm)

    return sorted(norm_regex)
