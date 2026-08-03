# TalentLens AI

An AI-powered resume screening platform that combines **semantic embedding-based ATS scoring** with **LLM-generated recruiter feedback** to help both **students** optimize their resumes and **recruiters** identify the strongest candidates.

Unlike traditional ATS tools that rely primarily on keyword matching, TalentLens evaluates the **meaning and context** of resume content using sentence embeddings, enabling more accurate candidate assessment and ranking.

---

# Overview

TalentLens provides two dedicated workflows:

### Student Mode

Students can upload their resume along with a job description to receive:

* ATS score out of 100
* Component-wise score breakdown
* Requirement coverage analysis
* Semantic skill matching
* AI-generated recruiter-style feedback
* Career insights and hiring probability
* Downloadable PDF report

### Recruiter Mode

Recruiters can upload multiple resumes simultaneously to:

* Rank candidates automatically
* Compare ATS scores
* Review detailed AI-generated analysis
* View recruitment analytics
* Access candidate contact information
* Chat with an AI assistant about shortlisted candidates
* Export candidate reports

---

# Why TalentLens?

Most ATS platforms primarily search for matching keywords.

TalentLens goes a step further by understanding **semantic meaning**.

For example:

> Resume: *"Deployed microservices on AWS."*

> Job Description: *"Experience with cloud deployment."*

Even though the wording is different, TalentLens recognizes that both describe the same competency using sentence embeddings.

This semantic approach enables far more accurate resume evaluation than traditional keyword-based matching.

---

# ATS Scoring Architecture

TalentLens uses a weighted **100-point semantic scoring model** consisting of four independent evaluation components.

| Component            | Weight | Purpose                                                            |
| -------------------- | ------ | ------------------------------------------------------------------ |
| Skill Match          | **35** | Exact and semantic skill alignment with the job description        |
| Requirement Coverage | **30** | Semantic matching of every job requirement against resume passages |
| Experience Fit       | **20** | Seniority, experience level, and role alignment                    |
| Profile Signals      | **15** | Education, certifications, projects, GitHub, resume quality        |

---

# Core Differentiator

The most distinctive feature of TalentLens is **Requirement Coverage Analysis**.

Instead of comparing resumes section-by-section or counting keywords, the system:

1. Uses Groq to parse the job description into structured requirements.
2. Assigns weights based on urgency words such as:

   * Must
   * Required
   * Mandatory
   * Preferred
   * Nice to Have
3. Splits the resume into overlapping 80-word passages.
4. Converts both requirements and resume passages into sentence embeddings using **all-MiniLM-L6-v2**.
5. Computes cosine similarity between each requirement and every passage.
6. Selects the highest-scoring passage as evidence for requirement satisfaction.

This semantic retrieval approach is similar to techniques used in enterprise recruitment platforms such as **Workday** and **Greenhouse**.

---

# Features

## Student Dashboard

* Upload resume (PDF)
* Paste job description
* ATS score out of 100
* Detailed component breakdown
* Requirement coverage visualization
* Resume section semantic alignment
* Exact, semantic, and missing skill detection
* AI-generated strengths
* AI-generated weaknesses
* Personalized improvement suggestions
* Resume summary
* Hiring probability
* Career recommendations
* Interactive charts
* Downloadable PDF report

---

## Recruiter Dashboard

* Upload multiple resumes simultaneously
* Automatic candidate ranking
* Detailed ATS analysis for every applicant
* AI-generated recruiter feedback
* Recruitment analytics dashboard
* Verdict distribution visualization
* Score statistics
* Candidate contact management
* One-click email invitation table
* AI chatbot for candidate comparison and Q&A
* Individual PDF report export

---

# Technology Stack

## Backend

* Python 3.11+
* FastAPI
* sentence-transformers (`all-MiniLM-L6-v2`)
* Groq SDK (`llama-3.1-8b-instant`)
* PyMuPDF (`fitz`)
* python-dotenv

---

## Frontend

* React 19
* Vite
* React Router DOM
* Recharts
* jsPDF
* jspdf-autotable
* Custom CSS (No UI Component Library)

---

# Project Structure

```text
TalentLens-AI/
├── backend/
│   ├── main.py               # FastAPI application (/analyze, /chat)
│   ├── scorer.py             # ATS scoring engine
│   ├── semantic_matcher.py   # Sentence embeddings & semantic similarity
│   ├── jd_parser.py          # Groq-powered Job Description parser
│   ├── skill_extractor.py    # Hybrid skill extraction
│   ├── synonyms.py           # Skill synonym taxonomy
│   ├── resume_features.py    # Resume feature extraction
│   ├── ranker.py             # Multi-resume ranking engine
│   ├── utils.py              # Resume parsing utilities
│   └── .env
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Landing.jsx
│       │   ├── StudentDashboard.jsx
│       │   └── RecruiterDashboard.jsx
│       │
│       ├── components/
│       │   ├── Sidebar.jsx
│       │   └── Chatbot.jsx
│       │
│       └── styles/
│           └── theme.css
│
├── .env.example
├── .gitignore
└── README.md
```

---

# Installation

## Prerequisites

* Python 3.11+
* Node.js 18+
* Groq API Key

---

## Backend Setup

```bash
python -m venv venv

venv\Scripts\activate
# macOS/Linux
# source venv/bin/activate

pip install fastapi uvicorn python-multipart python-dotenv groq pymupdf sentence-transformers torch
```

Create:

```text
backend/.env
```

```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant
CORS_ORIGINS=http://localhost:5173
```

Run the backend:

```bash
cd backend
..\venv\Scripts\python.exe -m uvicorn main:app --reload
```

Backend URL:

```
http://127.0.0.1:8000
```

---

## Frontend Setup

```bash
cd frontend

npm install

npm run dev
```

Frontend URL:

```
http://localhost:5174
```

Ensure both frontend and backend servers are running simultaneously.

---

# ATS Scoring Pipeline

## 1. Job Description Parsing

The job description is processed using **Groq** to extract structured requirements containing:

* Requirement text
* Category
* Skill type
* Priority weight

Priority is determined using urgency indicators such as:

* Must
* Required
* Mandatory
* Essential
* Preferred
* Nice to Have

---

## 2. Skill Match (35 Points)

Skills are extracted using a hybrid pipeline consisting of:

* Regex matching
* 115 canonical skills
* 110+ synonym mappings
* Optional Groq extraction for domain-specific skills

Each job skill is compared against resume skills using:

* Exact matching
* Semantic similarity (≥ 0.70 cosine similarity)

Scores are weighted according to job description importance.

---

## 3. Requirement Coverage (30 Points)

Every parsed job requirement is embedded using **all-MiniLM-L6-v2**.

The resume is divided into overlapping 80-word passages with a 20-word overlap.

Cosine similarity is calculated between every requirement and every passage.

Coverage interpretation:

| Similarity | Interpretation |
| ---------- | -------------- |
| ≥ 0.72     | Strong Match   |
| ≥ 0.52     | Partial Match  |
| ≥ 0.38     | Weak Match     |
| < 0.38     | Missing        |

The overall Requirement Coverage score is calculated as the weighted mean of all requirement matches.

---

## 4. Experience Fit (20 Points)

Experience evaluation includes:

* Years of experience
* Seniority level
* Semantic similarity between experience section and job description

A calibration multiplier (0.6–1.0) adjusts scores based on seniority alignment.

---

## 5. Profile Signals (15 Points)

Additional quality indicators include:

* Degree detection
* GPA presence
* Certifications (AWS, Google, IBM, Coursera, etc.)
* Project count
* GitHub profile
* Deployed projects
* Resume section completeness
* Resume length

---

# API Endpoints

## POST `/analyze`

Accepts:

* One or more resume PDFs
* Job description text

### Single Resume Response

Returns:

* ATS score
* Verdict
* Score breakdown
* Matched skills
* Missing skills
* Requirement coverage
* Semantic similarity
* Parsed job description
* AI-generated strengths
* AI-generated weaknesses
* Improvement suggestions
* Resume summary
* Reasoning

### Multiple Resume Response

Returns a ranked list of candidates sorted by ATS score.

---

## POST `/chat`

Accepts:

* User message
* Analysis object

Returns AI-generated recruiter responses powered by Groq.

---

# Environment Variables

| Variable       | Description             | Default                 |
| -------------- | ----------------------- | ----------------------- |
| `GROQ_API_KEY` | Groq API Key            | Required                |
| `GROQ_MODEL`   | Groq model              | `llama-3.1-8b-instant`  |
| `CORS_ORIGINS` | Allowed frontend origin | `http://localhost:5173` |

---

# License

This project is licensed under the **MIT License**.
