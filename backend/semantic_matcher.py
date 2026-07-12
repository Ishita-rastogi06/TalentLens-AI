"""
Semantic Matcher

Implements passage-level bi-encoder matching — the same technique used by
commercial ATS platforms to go beyond keyword matching.

Architecture
────────────
1. Requirement Coverage  (requirement_coverage)
   Each JD requirement phrase is embedded and matched against resume PASSAGES
   (not just skill tokens). This catches paraphrased, contextual, and implied
   mentions (e.g. "built REST APIs" → satisfies "REST API development" requirement).

2. Section-level Similarity  (compute_section_similarity)
   Chunked mean pooling across resume sections vs JD text — gives a holistic
   document alignment signal.

3. Skill-level Matching  (semantic_match)
   Legacy skill-token matching, still used for the "Matched/Missing" skill list UI.

Model: all-MiniLM-L6-v2
  - 80M params, 384-dim embeddings
  - Best-in-class speed/quality for sentence-level bi-encoder retrieval
  - Production-used in Haystack, Weaviate, Pinecone
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache

from sentence_transformers import SentenceTransformer, util

logger = logging.getLogger(__name__)

# Load once at module level — warm on first import
_MODEL_NAME = "all-MiniLM-L6-v2"
model = SentenceTransformer(_MODEL_NAME)


# ── Text utilities ────────────────────────────────────────────────────────────

def _chunk_text(text: str, max_words: int = 80, overlap: int = 20) -> list[str]:
    """
    Split text into overlapping word-windows.
    Overlap ensures cross-boundary mentions are captured.
    Mirrors the sliding-window passage retrieval used in enterprise ATS search.
    """
    words = text.split()
    if not words:
        return []
    chunks = []
    step = max_words - overlap
    for i in range(0, len(words), step):
        chunk = " ".join(words[i: i + max_words])
        if chunk.strip():
            chunks.append(chunk.strip())
    return chunks


def _extract_section(text: str, keywords: list[str]) -> str:
    """
    Pull lines belonging to a named section using boundary detection.
    """
    lines = text.splitlines()
    section_lines: list[str] = []
    inside = False

    all_headers = [
        "experience", "education", "skills", "projects",
        "certifications", "summary", "objective", "profile",
        "achievements", "awards", "publications", "languages",
        "volunteer", "interests", "references", "work history",
        "training", "courses",
    ]

    for line in lines:
        lower = line.strip().lower()
        if any(kw in lower for kw in keywords) and len(lower) < 60:
            inside = True
            continue
        if inside:
            is_boundary = (
                any(h in lower for h in all_headers
                    if not any(kw in lower for kw in keywords))
                and len(lower) < 60
            )
            if is_boundary:
                break
            section_lines.append(line)

    return " ".join(section_lines).strip()


# ── Core matching functions ───────────────────────────────────────────────────

def requirement_coverage(
    resume_text: str,
    requirements: list[dict],
) -> list[dict]:
    """
    Passage-level requirement coverage.

    For each JD requirement, finds the best-matching resume passage
    using cosine similarity of sentence embeddings.

    Returns the same requirements list, each enriched with:
      - "coverage_score"  : float 0–1  (how well resume covers this requirement)
      - "matched_passage" : str        (the resume passage that matched best)
      - "match_type"      : "strong" | "partial" | "weak" | "missing"

    Thresholds (calibrated on sentence-transformers benchmarks):
      ≥ 0.72  → strong   (functionally equivalent language)
      ≥ 0.52  → partial  (related/adjacent concept)
      ≥ 0.38  → weak     (loosely related)
      < 0.38  → missing
    """
    if not requirements:
        return []

    # Build resume passage corpus
    passages = _chunk_text(resume_text, max_words=80, overlap=20)
    if not passages:
        for req in requirements:
            req.update({"coverage_score": 0.0, "matched_passage": "", "match_type": "missing"})
        return requirements

    # Batch-encode everything at once for speed
    req_texts = [r["text"] for r in requirements]
    req_embeddings = model.encode(req_texts, convert_to_tensor=True, show_progress_bar=False)
    passage_embeddings = model.encode(passages, convert_to_tensor=True, show_progress_bar=False)

    # For each requirement find best passage
    sim_matrix = util.cos_sim(req_embeddings, passage_embeddings)  # shape: (n_req, n_passages)

    results = []
    for i, req in enumerate(requirements):
        scores = sim_matrix[i]
        best_score = float(scores.max())
        best_idx = int(scores.argmax())
        best_passage = passages[best_idx]

        if best_score >= 0.72:
            match_type = "strong"
        elif best_score >= 0.52:
            match_type = "partial"
        elif best_score >= 0.38:
            match_type = "weak"
        else:
            match_type = "missing"

        results.append(
            {
                **req,
                "coverage_score": round(best_score, 4),
                "matched_passage": best_passage,
                "match_type": match_type,
            }
        )

    return results


def compute_section_similarity(resume_text: str, jd_text: str) -> dict:
    """
    Section-level document similarity.

    Uses mean-pooled chunk embeddings to compare:
      - Overall resume vs JD
      - Resume skills section vs JD
      - Resume experience section vs JD
      - Resume education section vs JD

    Returns floats in [0, 1].
    """

    def _mean_embed(text: str):
        chunks = _chunk_text(text, max_words=100, overlap=30)
        if not chunks:
            return None
        embs = model.encode(chunks, convert_to_tensor=True, show_progress_bar=False)
        return embs.mean(dim=0)

    def _sim(text_a: str, text_b: str) -> float:
        if not text_a.strip() or not text_b.strip():
            return 0.0
        e_a = _mean_embed(text_a)
        e_b = _mean_embed(text_b)
        if e_a is None or e_b is None:
            return 0.0
        return float(util.cos_sim(e_a, e_b))

    overall = _sim(resume_text, jd_text)

    skills_text = _extract_section(
        resume_text, ["skills", "technical skills", "core competencies", "technologies"]
    )
    experience_text = _extract_section(
        resume_text, ["experience", "work history", "employment", "internship", "work experience"]
    )
    education_text = _extract_section(
        resume_text, ["education", "academic", "degree", "university"]
    )

    skills_sim = _sim(skills_text, jd_text) if skills_text else overall * 0.85
    experience_sim = _sim(experience_text, jd_text) if experience_text else overall * 0.75
    education_sim = _sim(education_text, jd_text) if education_text else overall * 0.55

    return {
        "overall": round(overall, 4),
        "skills_section": round(skills_sim, 4),
        "experience_section": round(experience_sim, 4),
        "education_section": round(education_sim, 4),
    }


def semantic_match(resume_text: str, jd_text: str) -> dict:
    """
    Skill-token level matching (legacy interface, used for Matched/Missing UI).

    Returns { jd_skill: best_matching_resume_skill }
    """
    from skill_extractor import extract_skills

    resume_skills = extract_skills(resume_text)
    jd_skills = extract_skills(jd_text, use_groq=True)

    if not resume_skills or not jd_skills:
        return {}

    resume_embs = model.encode(resume_skills, convert_to_tensor=True, show_progress_bar=False)
    jd_embs = model.encode(jd_skills, convert_to_tensor=True, show_progress_bar=False)

    sim_matrix = util.cos_sim(jd_embs, resume_embs)
    matches: dict[str, str] = {}

    for i, jd_skill in enumerate(jd_skills):
        best_score = float(sim_matrix[i].max())
        best_idx = int(sim_matrix[i].argmax())
        if best_score >= 0.70:
            matches[jd_skill] = resume_skills[best_idx]

    return matches
