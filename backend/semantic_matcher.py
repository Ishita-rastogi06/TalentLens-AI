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

# Load once at module level — warm on first import with offline fallback
_MODEL_NAME = "all-MiniLM-L6-v2"

def _load_model() -> SentenceTransformer:
    try:
        # Try loading from local cache first to avoid network delays / DNS issues
        return SentenceTransformer(_MODEL_NAME, local_files_only=True)
    except Exception:
        try:
            # Fall back to online loading if model is not yet cached locally
            return SentenceTransformer(_MODEL_NAME)
        except Exception as exc:
            logger.error("Failed to load SentenceTransformer model (%s)", exc)
            raise exc

model = _load_model()


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

def build_jd_semantic_cache(jd_text: str, requirements: list[dict], jd_skills: list[str]) -> dict:
    """Create immutable JD embeddings once per multi-resume upload batch."""
    def _mean_embed(text: str):
        chunks = _chunk_text(text, max_words=100, overlap=30)
        if not chunks:
            return None
        return model.encode(chunks, batch_size=32, convert_to_tensor=True, show_progress_bar=False).mean(dim=0)

    def _get_req_text(r: Any) -> str:
        if isinstance(r, dict):
            return str(r.get("text") or r.get("requirement") or "").strip()
        return str(r or "").strip()

    requirement_texts = [_get_req_text(r) for r in requirements if _get_req_text(r)]
    return {
        "requirement_embeddings": model.encode(requirement_texts, batch_size=32, convert_to_tensor=True, show_progress_bar=False)
        if requirement_texts else None,
        "skill_embeddings": model.encode(jd_skills, batch_size=32, convert_to_tensor=True, show_progress_bar=False)
        if jd_skills else None,
        "jd_mean_embedding": _mean_embed(jd_text),
    }


def requirement_coverage(
    resume_text: str,
    requirements: list[dict],
    cached_requirement_embeddings=None,
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

    def _get_req_text(r: Any) -> str:
        if isinstance(r, dict):
            return str(r.get("text") or r.get("requirement") or "").strip()
        return str(r or "").strip()

    # Build resume passage corpus
    passages = _chunk_text(resume_text, max_words=80, overlap=20)
    if not passages:
        for req in requirements:
            if isinstance(req, dict):
                req.update({"coverage_score": 0.0, "matched_passage": "", "match_type": "missing"})
        return requirements

    # Batch-encode everything at once for speed
    req_texts = [_get_req_text(r) for r in requirements]
    req_embeddings = cached_requirement_embeddings
    if req_embeddings is None:
        valid_req_texts = [t for t in req_texts if t]
        if valid_req_texts:
            req_embeddings = model.encode(req_texts, batch_size=32, convert_to_tensor=True, show_progress_bar=False)
        else:
            req_embeddings = None

    if req_embeddings is None:
        for req in requirements:
            if isinstance(req, dict):
                req.update({"coverage_score": 0.0, "matched_passage": "", "match_type": "missing"})
        return requirements

    passage_embeddings = model.encode(passages, batch_size=32, convert_to_tensor=True, show_progress_bar=False)

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


def compute_section_similarity(resume_text: str, jd_text: str, cached_jd_mean_embedding=None) -> dict:
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

    def _sim_to_jd(text: str) -> float:
        if not text.strip():
            return 0.0
        e_a = _mean_embed(text)
        e_b = cached_jd_mean_embedding if cached_jd_mean_embedding is not None else _mean_embed(jd_text)
        if e_a is None or e_b is None:
            return 0.0
        return float(util.cos_sim(e_a, e_b))

    overall = _sim_to_jd(resume_text)

    skills_text = _extract_section(
        resume_text, ["skills", "technical skills", "core competencies", "technologies"]
    )
    experience_text = _extract_section(
        resume_text, ["experience", "work history", "employment", "internship", "work experience"]
    )
    education_text = _extract_section(
        resume_text, ["education", "academic", "degree", "university"]
    )

    skills_sim = _sim_to_jd(skills_text) if skills_text else overall * 0.85
    experience_sim = _sim_to_jd(experience_text) if experience_text else overall * 0.75
    education_sim = _sim_to_jd(education_text) if education_text else overall * 0.55

    return {
        "overall": round(overall, 4),
        "skills_section": round(skills_sim, 4),
        "experience_section": round(experience_sim, 4),
        "education_section": round(education_sim, 4),
    }


def semantic_match(
    resume_text: str,
    jd_text: str,
    cached_jd_skills: list[str] | None = None,
    cached_jd_skill_embeddings=None,
    resume_skills: list[str] | None = None,
) -> dict:
    """
    Skill-token level matching (legacy interface, used for Matched/Missing UI).

    Returns { jd_skill: best_matching_resume_skill }
    """
    from skill_extractor import extract_skills

    resume_skills = resume_skills if resume_skills is not None else extract_skills(resume_text)
    # Multi-resume analysis supplies one pre-extracted JD skill list. Reusing
    # it avoids repeating the same remote extraction for every resume.
    jd_skills = cached_jd_skills if cached_jd_skills else extract_skills(jd_text, use_groq=True)

    if not resume_skills or not jd_skills:
        return {}

    resume_embs = model.encode(resume_skills, batch_size=32, convert_to_tensor=True, show_progress_bar=False)
    jd_embs = cached_jd_skill_embeddings
    if jd_embs is None:
        jd_embs = model.encode(jd_skills, batch_size=32, convert_to_tensor=True, show_progress_bar=False)

    sim_matrix = util.cos_sim(jd_embs, resume_embs)
    matches: dict[str, str] = {}

    for i, jd_skill in enumerate(jd_skills):
        best_score = float(sim_matrix[i].max())
        best_idx = int(sim_matrix[i].argmax())
        if best_score >= 0.70:
            matches[jd_skill] = resume_skills[best_idx]

    return matches
