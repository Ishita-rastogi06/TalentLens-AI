# utils.py

import fitz
import json
import re


# -----------------------------
# PDF TEXT EXTRACTION
# -----------------------------
def extract_resume_text(pdf_bytes):
    """
    Extracts text from uploaded PDF.
    """

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    text = ""

    for page in doc:
        text += page.get_text()

    doc.close()

    return text.strip()


# -----------------------------
# REMOVE MARKDOWN FROM LLM OUTPUT
# -----------------------------
def clean_json_response(content: str):

    content = content.strip()

    if content.startswith("```json"):
        content = content.replace("```json", "", 1)

    if content.startswith("```"):
        content = content.replace("```", "", 1)

    if content.endswith("```"):
        content = content[:-3]

    return content.strip()


# -----------------------------
# SAFE JSON PARSER
# -----------------------------
def parse_json(content: str):

    cleaned = clean_json_response(content)

    try:
        return json.loads(cleaned)

    except Exception:

        match = re.search(r"\{.*\}", cleaned, re.DOTALL)

        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass

        return {
            "error": "Invalid JSON returned by LLM",
            "raw": cleaned
        }


# -----------------------------
# NORMALIZE SKILLS
# -----------------------------
SKILL_MAP = {

    "ml": "machine learning",
    "machine-learning": "machine learning",

    "dl": "deep learning",

    "js": "javascript",
    "node": "node.js",

    "tf": "tensorflow",

    "rest api": "rest",
    "restful api": "rest",
    "restful services": "rest",

    "postgres": "postgresql",

    "mongo": "mongodb",

    "git hub": "github",

    "py torch": "pytorch",

    "amazon web services": "aws",

    "gcp": "google cloud",

    "google cloud platform": "google cloud",

    "ci/cd": "cicd",

    "ci cd": "cicd"
}


def normalize_skill(skill: str):

    skill = skill.lower().strip()

    skill = re.sub(r"\s+", " ", skill)

    return SKILL_MAP.get(skill, skill)


# -----------------------------
# REMOVE DUPLICATES
# -----------------------------
def normalize_skill_list(skills):

    normalized = []

    seen = set()

    for skill in skills:

        s = normalize_skill(skill)

        if s not in seen:
            seen.add(s)
            normalized.append(s)

    return normalized


# -----------------------------
# SIMPLE MATCHING
# -----------------------------
def skill_match(skill, resume_skills):

    skill = normalize_skill(skill)

    resume_skills = normalize_skill_list(resume_skills)

    return skill in resume_skills
# -----------------------------
# EXTRACT EMAIL
# -----------------------------
def extract_email(text):

    emails = re.findall(
        r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
        text
    )

    return emails[0] if emails else ""


# -----------------------------
# EXTRACT NAME
# -----------------------------

def extract_name(text):

    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for line in lines[:15]:
        match = re.match(r'^(?:name|candidate|applicant)\s*[:\-\s]+(.+)$', line, re.I)
        if match:
            name = match.group(1).strip()
            if name and len(name.split()) <= 8:
                return name

    for line in lines[:6]:
        if line and len(line.split()) <= 7:
            lower = line.lower()
            if any(keyword in lower for keyword in ["resume", "curriculum", "cv", "experience", "education", "skills", "email", "phone"]):
                continue
            if not extract_email(line) and not extract_phone(line):
                return line

    return ""


# -----------------------------
# EXTRACT PHONE
# -----------------------------

def extract_phone(text):

    pattern = r"""
    (?:
        \+\d{1,3}[\s\-]?
    )?
    (?:\(?\d{2,4}\)?[\s\-]?)?
    \d{3,4}[\s\-]?\d{4}
    """

    phones = re.findall(pattern, text, re.VERBOSE)

    return phones[0].strip() if phones else ""