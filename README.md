# TalentLens AI

An AI-powered resume screening platform that combines **semantic embedding-based ATS scoring** with **LLM-generated recruiter feedback** — built for both students and recruiters.

Students get a detailed breakdown of how their resume performs against a job description. Recruiters can upload multiple resumes, rank all candidates, and get AI-written analysis for each one.

---

## What Makes the Scoring Different

Most ATS tools count matching keywords. TalentLens matches **meaning**.

A resume that says *"deployed microservices on AWS"* will satisfy the JD requirement *"cloud deployment experience"* — even though the words are different — because the system uses sentence embeddings to understand context, not just overlap.

The scoring model has four components:

| Component | Points | What it measures |
|---|---|---|
| Skill Match | 35 | Exact + semantic skill coverage, weighted by JD importance |
| Requirement Coverage | 30 | Passage-level match of every JD requirement against resume paragraphs |
| Experience Fit | 20 | Seniority alignment, years of experience, semantic experience similarity |
| Profile Signals | 15 | Education, certifications, projects, resume structure quality |

**Requirement Coverage** is the core differentiator. The JD is parsed by Groq into individual requirements (each with a weight based on urgency language — "must", "required", "preferred", "nice to have"). Every requirement is then matched against overlapping 80-word passages from the resume using cosine similarity of sentence embeddings. This is the same technique used by enterprise ATS platforms like Workday and Greenhouse.

---

## Features

### Student Dashboard
- Upload resume PDF + paste a job description
- Get an ATS score out of 100 with a full component breakdown
- See which JD requirements your resume covers and which it misses
- Semantic alignment scores for each resume section vs the JD
- Skill match chips — exact match, semantic match, or missing
- AI-generated strengths, weaknesses, improvement suggestions, and summary (Groq)
- Insights tab with charts, career recommendation, hiring probability
- Download a PDF report

### Recruiter Dashboard
- Upload multiple resumes at once
- All candidates ranked by ATS score
- Full analysis view for each candidate with the same scoring detail
- Recruitment analytics — verdict distribution chart, score stats
- Connect tab — candidate contact table with one-click email invite
- AI chatbot to compare candidates or ask questions about the shortlist
- Export individual candidate PDF reports

---

## Tech Stack

**Backend**
- Python 3.11+
- FastAPI — API server
- sentence-transformers (`all-MiniLM-L6-v2`) — local semantic embeddings
- Groq SDK (`llama-3.1-8b-instant`) — LLM for JD parsing and AI feedback
- PyMuPDF (`fitz`) — PDF text extraction
- python-dotenv — environment config

**Frontend**
- React 19 + Vite
- React Router DOM
- Recharts — bar charts, pie charts
- jsPDF + jspdf-autotable — PDF report export
- Custom CSS — no UI component library

---

## Project Structure

```
TalentLens-AI/
├── backend/
│   ├── main.py               # FastAPI app — /analyze and /chat endpoints
│   ├── scorer.py             # ATS scoring engine (4-component weighted model)
│   ├── semantic_matcher.py   # Sentence embeddings, passage-level matching, section similarity
│   ├── jd_parser.py          # Groq-powered JD parser — extracts typed requirements with weights
│   ├── skill_extractor.py    # Hybrid skill extraction (regex + Groq, 115 canonical skills)
│   ├── synonyms.py           # Skill synonym taxonomy (110+ canonical mappings)
│   ├── resume_features.py    # Experience, education, project, certification, quality analysis
│   ├── ranker.py             # Multi-resume ranking logic
│   ├── utils.py              # Name, email, phone extraction from resume text
│   └── .env                  # API keys (not committed — see .env.example)
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Landing.jsx            # Home page with role selection
│       │   ├── StudentDashboard.jsx   # Student analysis interface
│       │   └── RecruiterDashboard.jsx # Recruiter ranking + analysis interface
│       ├── components/
│       │   ├── Chatbot.jsx   # AI chat assistant
│       │   └── Sidebar.jsx   # Navigation sidebar
│       └── styles/
│           └── theme.css     # All custom styling
│
├── .env.example              # Environment variable template
├── .gitignore
└── README.md
```

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- A free Groq API key from [console.groq.com](https://console.groq.com)

### Backend

```bash
# From the project root
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

pip install fastapi uvicorn python-multipart python-dotenv groq pymupdf sentence-transformers torch

```

Create `backend/.env` (copy from `.env.example`):
```
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant
CORS_ORIGINS=http://localhost:5173
```

Start the server:
```bash
cd backend
uvicorn main:app --reload
```

Backend runs at `http://127.0.0.1:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5174`

Open `http://localhost:5174` in your browser. Both terminals must stay running.

---

## How the ATS Score is Calculated

### 1. JD Parsing
Groq reads the job description and extracts every requirement as a structured object — text, category (required / preferred / nice-to-have), skill type, and a weight between 0.1 and 1.0. Requirements with urgency language ("must", "essential", "mandatory") get higher weights. This replaces the old hardcoded section-header approach.

### 2. Skill Match (35 pts)
Skills are extracted from both the resume and JD using a hybrid approach: regex matching against 115 canonical skills, synonym resolution via a 110-entry taxonomy, and optional Groq extraction for domain-specific terms the regex pass misses. Each JD skill is matched against resume skills for exact or semantic (≥0.70 cosine similarity) hits. Earned points are weighted by the skill's JD importance.

### 3. Requirement Coverage (30 pts)
Every JD requirement is embedded using `all-MiniLM-L6-v2`. The resume is split into overlapping 80-word passages (20-word overlap) and each passage is also embedded. For each requirement, the best-matching resume passage is found via cosine similarity. Scores ≥0.72 = strong match, ≥0.52 = partial, ≥0.38 = weak, below = missing. The component score is the weighted mean coverage across all requirements.

### 4. Experience Fit (20 pts)
The JD's seniority level and years required are parsed from the JD. The resume's experience section is semantically compared to the JD. A seniority calibration multiplier (0.6–1.0) is applied based on how well the candidate's years of experience align with the role's expectations.

### 5. Profile Signals (15 pts)
Regex-based signals: degree detection, GPA presence, certification keywords (Coursera, AWS, Google, IBM), project count, GitHub presence, deployed project mentions, resume section completeness, and resume length.

---

## API Endpoints

### `POST /analyze`
Accepts one or more resume PDFs and a job description string.

- Single resume → returns `{ analysis: { score, verdict, matched_skills, missing_skills, semantic_similarity, score_components, requirement_coverage, parsed_jd, strengths, weaknesses, improvements, resume_summary, reasoning, ... } }`
- Multiple resumes → returns `{ ranking: [ { rank, name, score, ... }, ... ] }` sorted by score descending

### `POST /chat`
Accepts a message and an analysis object (single or array). Returns an AI-generated markdown response from Groq.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `GROQ_API_KEY` | Your Groq API key | required |
| `GROQ_MODEL` | Groq model to use | `llama-3.1-8b-instant` |
| `CORS_ORIGINS` | Allowed frontend origins | `http://localhost:5173` |

---

## License

MIT
