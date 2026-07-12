import Sidebar from "../components/Sidebar";
import { useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Chatbot from "../components/Chatbot";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

export default function StudentDashboard() {

  const [resume, setResume] = useState(null);
  const [jd, setJd] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [activeTab, setActiveTab] = useState("dashboard");
  const insightsCarouselRef = useRef(null);

  const scrollInsights = (direction) => {
    insightsCarouselRef.current?.scrollBy({
      left: direction * insightsCarouselRef.current.clientWidth * 0.72,
      behavior: "smooth",
    });
  };

  const getInsightText = (item, preferredKey) => {
    if (!item) return "";
    if (typeof item !== "object") return String(item);

    if (item[preferredKey]) return String(item[preferredKey]);

    const textValue = Object.values(item).find(
      (value) => typeof value === "string" && value.trim()
    );

    return textValue || JSON.stringify(item);
  };

  const analyzeResume = async () => {

    if (!resume) {
      alert("Upload Resume");
      return;
    }

    if (!jd.trim()) {
      alert("Paste Job Description");
      return;
    }

    setLoading(true);

    const formData = new FormData();

    formData.append("resume", resume);
    formData.append("job_description", jd);

    try {

      const response = await fetch(
        "http://127.0.0.1:8000/analyze",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      console.log("Backend Response:", data);

      if (data.analysis) {

        setResult(data.analysis);

        setActiveTab("analysis");

      }

    } catch (err) {

      console.log(err);

      alert("Backend Error");

    }

    setLoading(false);

  };
 const downloadReport = () => {

  if (!result) {
    alert("Analyze resume first.");
    return;
  }

  const doc = new jsPDF();

  const cleanText = (text = "") =>
    String(text)
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  let y = 20;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("TalentLens AI", 20, y);

  y += 10;

  doc.setFontSize(14);
  doc.text("Resume Analysis Report", 20, y);

  y += 12;

  doc.setFont("helvetica", "normal");

  doc.text(`ATS Score : ${result.score}%`, 20, y);
  y += 8;

  doc.text(`Verdict : ${cleanText(result.verdict)}`, 20, y);
  y += 12;

  // Resume Summary
  doc.setFont("helvetica", "bold");
  doc.text("Resume Summary", 20, y);

  y += 8;

  doc.setFont("helvetica", "normal");

  const summary = doc.splitTextToSize(
    cleanText(result.resume_summary),
    170
  );

  doc.text(summary, 20, y);

  y += summary.length * 7 + 8;

  // Reasoning
  doc.setFont("helvetica", "bold");
  doc.text("Reasoning", 20, y);

  y += 8;

  doc.setFont("helvetica", "normal");

  const reasoning = doc.splitTextToSize(
    cleanText(result.reasoning),
    170
  );

  doc.text(reasoning, 20, y);

  y += reasoning.length * 7 + 10;

  // Matched Skills
  autoTable(doc,{
    startY:y,
    head:[["Matched Skills"]],
    body:(result.matched_skills || []).map(skill=>[
      cleanText(skill)
    ])
  });

  y = doc.lastAutoTable.finalY + 10;

  // Missing Skills
  autoTable(doc,{
    startY:y,
    head:[["Missing Skills"]],
    body:(result.missing_skills || []).map(skill=>[
      cleanText(skill)
    ])
  });

  y = doc.lastAutoTable.finalY + 10;

  // Strengths
  autoTable(doc,{
    startY:y,
    head:[["Strengths"]],
    body:(result.strengths || []).map(item=>[
      cleanText(
        typeof item==="object"
        ? item.strength
        : item
      )
    ])
  });

  y = doc.lastAutoTable.finalY + 10;

  // Weaknesses
  autoTable(doc,{
    startY:y,
    head:[["Weaknesses"]],
    body:(result.weaknesses || []).map(item=>[
      cleanText(
        typeof item==="object"
        ? item.weakness
        : item
      )
    ])
  });

  y = doc.lastAutoTable.finalY + 10;

  // Improvements
  autoTable(doc,{
    startY:y,
    head:[["Improvements"]],
    body:(result.improvements || []).map(item=>[
      cleanText(
        typeof item==="object"
        ? item.improvement
        : item
      )
    ])
  });

  doc.save("TalentLens_Report.pdf");
};

const skillData = Object.entries(result?.skill_scores || {}).map(
  ([skill, value]) => ({
    skill,
    score: value,
  })
);

const pieData = [
  {
    name: "Matched",
    value: result?.matched_skills?.length || 0,
  },
  {
    name: "Missing",
    value: result?.missing_skills?.length || 0,
  },
];

const COLORS = ["#c3955b", "#7b3048"];

  return (

    <div className="app-layout">

      <Sidebar
        role="student"
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <div className="main-area">

        {activeTab==="dashboard" && (

          <>

            <h1>
              Student AI Screening
            </h1>

            <div className="upload-panel">

              <h2>
                Analyze Your Resume
              </h2>

              <input
                type="file"
                accept=".pdf"
                onChange={(e)=>setResume(e.target.files[0])}
              />

              {
                resume &&
                <p className="selected-file-name">
                  {resume.name}
                </p>
              }

              <textarea
                placeholder="Paste Job Description"
                value={jd}
                onChange={(e)=>setJd(e.target.value)}
              />

              <button onClick={analyzeResume}>
                {
                  loading
                  ?
                  "Analyzing..."
                  :
                  "Analyze Resume"
                }
              </button>

            </div>

          </>

        )}        {activeTab==="analysis" && result && (
          <>
            <h1>Resume Analysis</h1>

            <div className="result-panel">

              {/* ── JD Meta banner ── */}
              {result.parsed_jd && result.parsed_jd.job_title !== "Unknown" && (
                <div className="jd-meta-banner">
                  <span className="jd-meta-item">
                    <span className="jd-meta-icon">💼</span>
                    <strong>{result.parsed_jd.job_title}</strong>
                  </span>
                  {result.parsed_jd.seniority && result.parsed_jd.seniority !== "unknown" && (
                    <span className="jd-meta-item">
                      <span className="jd-meta-icon">📈</span>
                      {result.parsed_jd.seniority.charAt(0).toUpperCase() + result.parsed_jd.seniority.slice(1)} level
                    </span>
                  )}
                  {result.parsed_jd.years_experience_required > 0 && (
                    <span className="jd-meta-item">
                      <span className="jd-meta-icon">🗓</span>
                      {result.parsed_jd.years_experience_required}+ yrs required
                    </span>
                  )}
                  <span className="jd-meta-item">
                    <span className="jd-meta-icon">📋</span>
                    {result.parsed_jd.total_requirements} requirements parsed
                  </span>
                </div>
              )}

              {/* ── ATS Score Hero ── */}
              <div className="result-card ats-score-card">
                <div className="ats-score-layout">
                  <div className="ats-ring-wrap">
                    <svg viewBox="0 0 120 120" className="ats-ring-svg">
                      <circle cx="60" cy="60" r="52" className="ats-ring-bg"/>
                      <circle
                        cx="60" cy="60" r="52"
                        className="ats-ring-fill"
                        strokeDasharray={`${result.score * 3.267} 326.7`}
                        strokeDashoffset="0"
                        transform="rotate(-90 60 60)"
                      />
                    </svg>
                    <div className="ats-ring-inner">
                      <span className="ats-ring-number">{result.score}</span>
                      <span className="ats-ring-denom">/ 100</span>
                    </div>
                  </div>
                  <div className="ats-score-info">
                    <div className="ats-verdict-badge">{result.verdict}</div>
                    <p className="ats-confidence-text">Match confidence: <strong>{result.confidence}%</strong></p>
                    <div className="ats-components-list">
                      {result.score_components && Object.entries({
                        "Skill Match":           { pts: result.score_components.skill_match,          max: 35 },
                        "Requirement Coverage":  { pts: result.score_components.requirement_coverage, max: 30 },
                        "Experience Fit":        { pts: result.score_components.experience_fit,       max: 20 },
                        "Profile Signals":       { pts: result.score_components.profile_signals,      max: 15 },
                      }).map(([label, { pts, max }]) => (
                        <div className="ats-comp-row" key={label}>
                          <span className="ats-comp-label">{label}</span>
                          <div className="ats-comp-bar-wrap">
                            <div className="ats-comp-bar">
                              <div className="ats-comp-bar-fill" style={{width:`${(pts/max)*100}%`}}/>
                            </div>
                          </div>
                          <span className="ats-comp-pts">{pts}<span className="ats-comp-max">/{max}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Resume Summary ── */}
              <div className="result-card ai-card">
                <h3 className="section-heading">📄 Recruiter Summary</h3>
                <p className="ai-text">{result.resume_summary || "—"}</p>
              </div>

              {/* ── Semantic Alignment ── */}
              {result.semantic_similarity && (
                <div className="result-card">
                  <h3 className="section-heading">🧠 Semantic Alignment</h3>
                  <p className="section-subtext">
                    Passage-level similarity between your resume and the job description — measures contextual fit beyond keyword overlap.
                  </p>
                  <div className="sem-grid">
                    {[
                      { label: "Overall Document",    key: "overall",            icon: "📄" },
                      { label: "Skills Section",       key: "skills_section",     icon: "🛠" },
                      { label: "Experience Section",   key: "experience_section", icon: "💼" },
                      { label: "Education Section",    key: "education_section",  icon: "🎓" },
                    ].map(({ label, key, icon }) => {
                      const val = result.semantic_similarity[key] ?? 0;
                      const color = val >= 65 ? "#2e7d32" : val >= 45 ? "#c3955b" : "#c62828";
                      return (
                        <div className="sem-item" key={key}>
                          <div className="sem-row">
                            <span className="sem-label">{icon} {label}</span>
                            <span className="sem-pct" style={{color}}>{val}%</span>
                          </div>
                          <div className="progress">
                            <div className="progress-fill" style={{width:`${val}%`, background: color}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Requirement Coverage ── */}
              {(result.requirement_coverage || []).length > 0 && (
                <div className="result-card">
                  <h3 className="section-heading">📋 JD Requirement Coverage</h3>
                  <p className="section-subtext">
                    Each JD requirement matched against your resume passages — the same way enterprise ATS platforms score fit.
                  </p>
                  <div className="req-coverage-list">
                    {result.requirement_coverage.map((r, i) => {
                      const badgeClass = {
                        strong: "req-badge-strong",
                        partial: "req-badge-partial",
                        weak: "req-badge-weak",
                        missing: "req-badge-missing",
                      }[r.match_type] || "req-badge-missing";
                      const pct = Math.round(r.coverage * 100);
                      return (
                        <div className="req-row" key={i}>
                          <div className="req-row-top">
                            <span className="req-text">{r.requirement}</span>
                            <span className={`req-badge ${badgeClass}`}>
                              {r.match_type}
                            </span>
                          </div>
                          <div className="req-row-bottom">
                            <div className="progress req-progress">
                              <div className="progress-fill" style={{width:`${pct}%`}}/>
                            </div>
                            <span className="req-pct">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Skills ── */}
              <div className="grid">
                <div className="result-card">
                  <h3 className="section-heading">✅ Matched Skills</h3>
                  <div className="skill-tag-list">
                    {(result.matched_skills || []).map((skill, i) => (
                      <span key={i} className="skill-tag skill-tag-matched">{skill}</span>
                    ))}
                    {!(result.matched_skills || []).length && <p className="empty-msg">None matched.</p>}
                  </div>
                </div>
                <div className="result-card">
                  <h3 className="section-heading">❌ Missing Skills</h3>
                  <div className="skill-tag-list">
                    {(result.missing_skills || []).map((skill, i) => (
                      <span key={i} className="skill-tag skill-tag-missing">{skill}</span>
                    ))}
                    {!(result.missing_skills || []).length && <p className="empty-msg">No gaps found.</p>}
                  </div>
                </div>
              </div>

              {/* ── Strengths & Weaknesses ── */}
              <div className="grid">
                <div className="result-card ai-card">
                  <h3 className="section-heading">💪 Strengths</h3>
                  <ul className="ai-list ai-list-strengths">
                    {(result.strengths || []).map((item, i) => (
                      <li key={i}>{typeof item === "object" ? item.strength : item}</li>
                    ))}
                    {!(result.strengths || []).length && <li className="empty-msg">—</li>}
                  </ul>
                </div>
                <div className="result-card ai-card">
                  <h3 className="section-heading">⚠️ Weaknesses</h3>
                  <ul className="ai-list ai-list-weaknesses">
                    {(result.weaknesses || []).map((item, i) => (
                      <li key={i}>{typeof item === "object" ? item.weakness : item}</li>
                    ))}
                    {!(result.weaknesses || []).length && <li className="empty-msg">—</li>}
                  </ul>
                </div>
              </div>

              {/* ── Improvements ── */}
              <div className="result-card ai-card">
                <h3 className="section-heading">🚀 Improvement Suggestions</h3>
                <ol className="ai-list ai-list-improvements">
                  {(result.improvements || []).map((item, i) => (
                    <li key={i}>{typeof item === "object" ? item.improvement : item}</li>
                  ))}
                  {!(result.improvements || []).length && <li className="empty-msg">—</li>}
                </ol>
              </div>

              {/* ── Reasoning ── */}
              <div className="result-card ai-card">
                <h3 className="section-heading">📌 Why This Score?</h3>
                <p className="ai-text">{result.reasoning || "—"}</p>
              </div>

              {/* ── Skill Breakdown ── */}
              {Object.keys(result.skill_scores || {}).length > 0 && (
                <div className="result-card">
                  <h3 className="section-heading">📊 Skill Breakdown</h3>
                  <div className="skill-breakdown-list">
                    {Object.entries(result.skill_scores || {}).map(([skill, value]) => {
                      const color = value === 100 ? "#2e7d32" : value >= 80 ? "#c3955b" : "#c62828";
                      const label = value === 100 ? "✓ Exact" : value >= 80 ? "≈ Semantic" : "✗ Missing";
                      return (
                        <div className="skill-bd-row" key={skill}>
                          <span className="skill-bd-name">{skill}</span>
                          <div className="progress skill-bd-bar">
                            <div className="progress-fill" style={{width:`${value}%`, background: color}}/>
                          </div>
                          <span className="skill-bd-label" style={{color}}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </>
        )}



        {activeTab === "export" && (

  <div className="result-card">

    <h2>📄 Export AI Report</h2>

    <p>

      Download your complete TalentLens AI Resume Analysis Report.

    </p>

    <button onClick={downloadReport}>
  Download Report
</button>

  </div>

)}

{activeTab === "insights" && result && (

  <div className="insights-view">

  <h1 className="centered-title">Resume Insights</h1>
    <div className="insights-stats">
      <div className="stat-box ats-stat">
        <h2>{result.score}%</h2>
        <p>ATS Score</p>
      </div>

      <div className="stats-row">
        <div className="stat-box">
          <h2>{result.matched_skills?.length || 0}</h2>
          <p>Matched Skills</p>
        </div>

        <div className="stat-box">
          <h2>{result.missing_skills?.length || 0}</h2>
          <p>Missing Skills</p>
        </div>

        <div className="stat-box">
          <h2>{result.strengths?.length || 0}</h2>
          <p>Strengths</p>
        </div>
      </div>
    </div>

    <div className="insights-carousel-shell">
      <button
        className="insights-arrow insights-arrow-left"
        onClick={() => scrollInsights(-1)}
        type="button"
        aria-label="Previous insight"
      >
        ‹
      </button>

      <div className="insights-carousel" ref={insightsCarouselRef}>

      <div className="result-card">

        <h3>🎯 ATS Readiness</h3>

        <h1>{result.score}%</h1>

        <div className="progress">

          <div
            className="progress-fill"
            style={{ width: `${result.score}%` }}
          ></div>

        </div>

      </div>
      <div className="result-card insight-center-card">

        <h3>💼 Hiring Probability</h3>

        <h1>

          {result.score >= 80
            ? "High"
            : result.score >= 60
            ? "Medium"
            : "Low"}

        </h1>

      </div>

      <div className="result-card">

        <h3>📊 Skill Scores</h3>

        <div style={{ width: "100%", height: 300 }}>

          <ResponsiveContainer>

            <BarChart
              data={skillData}
              layout="vertical"
              margin={{ top: 8, right: 24, bottom: 8, left: 20 }}
            >

              <XAxis type="number" domain={[0, 100]} />

              <YAxis
                dataKey="skill"
                type="category"
                width={110}
                interval={0}
              />

              <Tooltip />

              <Bar dataKey="score" fill="#7b3048" radius={[0, 8, 8, 0]} barSize={22} />

            </BarChart>

          </ResponsiveContainer>

        </div>

      </div>
      <div className="result-card">

        <h3>🥧 Skill Match</h3>

        <div style={{ width: "100%", height: 300 }}>

          <ResponsiveContainer>

            <PieChart>

              <Pie

                data={pieData}

                dataKey="value"

                outerRadius={90}

              >

                {

                  pieData.map((entry, index) => (

                    <Cell
                      key={index}
                      fill={COLORS[index]}
                    />

                  ))

                }

              </Pie>

              <Tooltip />

            </PieChart>

          </ResponsiveContainer>

        </div>

      </div>

  <div className="result-card">

    <h3>🧠 AI Observations</h3>

    <ul>
      <li>ATS Match : {result.score}%</li>
      <li>Matched Skills : {result.matched_skills?.length || 0}</li>
      <li>Missing Skills : {result.missing_skills?.length || 0}</li>
      <li>Strengths : {result.strengths?.length || 0}</li>
      <li>Weaknesses : {result.weaknesses?.length || 0}</li>
    </ul>

  </div>
  <div className="result-card">

    <h3>🎯 Career Recommendation</h3>

    <h2>
      {
        result.score >= 85
          ? "Senior Software Engineer"
          : result.score >= 70
          ? "Software Developer"
          : result.score >= 55
          ? "Junior Developer"
          : "Intern / Fresher Role"
      }
    </h2>

    <p style={{ marginTop: "15px" }}>
      {
        result.score >= 85
          ? "Your resume is highly competitive for experienced technical roles."
          : result.score >= 70
          ? "You are ready for most software developer positions."
          : result.score >= 55
          ? "Improve missing skills before applying to higher roles."
          : "Build projects and strengthen your resume before applying."
      }
    </p>

  </div>
  <div className="result-card">

    <h3>🏥 Resume Health</h3>

    <div className="progress">

      <div
        className="progress-fill"
        style={{ width: `${result.score}%` }}
      ></div>
      

<hr style={{ margin: "20px 0", opacity: 0.3 }} />

<h4>🎯 Recommended Next Skills</h4>

<ul>
  {(result.missing_skills || []).slice(0, 5).map((skill, i) => (
    <li key={i}>{skill}</li>
  ))}
</ul>
    </div>

    <br />

    <h2>

      {result.score >= 80
        ? "🟢 Excellent"
        : result.score >= 60
        ? "🟡 Good"
        : "🔴 Needs Improvement"}

    </h2>

  </div>

      </div>

      <button
        className="insights-arrow insights-arrow-right"
        onClick={() => scrollInsights(1)}
        type="button"
        aria-label="Next insight"
      >
        ›
      </button>
    </div>

    <div className="result-card insights-skill-breakdown">
      <h3>Skill Scores</h3>

      <div className="insights-skill-chart">
        <ResponsiveContainer>
          <BarChart
            data={skillData}
            layout="vertical"
            margin={{ top: 8, right: 32, bottom: 8, left: 24 }}
          >
            <XAxis type="number" domain={[0, 100]} />
            <YAxis
              dataKey="skill"
              type="category"
              width={150}
              interval={0}
            />
            <Tooltip />
            <Bar dataKey="score" fill="#7b3048" radius={[0, 10, 10, 0]} barSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>

)}

        {activeTab === "chatbot" && (
  <Chatbot analysisResult={result} />
)}



      </div>

    </div>

  );

}
