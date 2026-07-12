import Sidebar from "../components/Sidebar";
import { useState } from "react";
import Chatbot from "../components/Chatbot";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";

export default function RecruiterDashboard() {

  const [resumes, setResumes] = useState([]);
  const [jd, setJd] = useState("");

  const [loading, setLoading] = useState(false);

  const [ranking, setRanking] = useState([]);
  const [chatAnalysis, setChatAnalysis] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [activeTab, setActiveTab] = useState("dashboard");
  const totalCandidates = ranking.length;

const averageScore =
  totalCandidates > 0
    ? Math.round(
        ranking.reduce((sum, c) => sum + c.score, 0) /
          totalCandidates
      )
    : 0;

const highestScore =
  totalCandidates > 0
    ? Math.max(...ranking.map((c) => c.score))
    : 0;

const lowestScore =
  totalCandidates > 0
    ? Math.min(...ranking.map((c) => c.score))
    : 0;
  const chartData = ranking.map((candidate) => ({
    name: candidate.name,
    score: candidate.score,
    matched: candidate.matched_skills?.length || 0,
    missing: candidate.missing_skills?.length || 0,
  }));

  const verdictData = [
    {
      name: "Excellent",
      value: ranking.filter((c) =>
        c.verdict?.toLowerCase().includes("excellent")
      ).length,
    },
    {
      name: "Good",
      value: ranking.filter((c) =>
        c.verdict?.toLowerCase().includes("good")
      ).length,
    },
    {
      name: "Average",
      value: ranking.filter((c) =>
        c.verdict?.toLowerCase().includes("average")
      ).length,
    },
    {
      name: "Poor",
      value: ranking.filter((c) =>
        c.verdict?.toLowerCase().includes("poor")
      ).length,
    },
  ];

  const verdictHasData = verdictData.some((item) => item.value > 0);


  const analyzeResumes = async () => {

    if (resumes.length === 0) {

      alert("Please upload resumes.");

      return;

    }

    if (!jd.trim()) {

      alert("Please paste Job Description.");

      return;

    }

    setLoading(true);

    const formData = new FormData();

    resumes.forEach((file) => {

      formData.append("resume", file);

    });

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

      console.log(data);

      if (data.ranking) {

        setRanking(data.ranking);

        setActiveTab("ranks");

      }

    }

    catch (err) {

      console.log(err);

      alert("Backend Error");

    }

    setLoading(false);

  };
  const exportPDF = () => {
  if (!selectedCandidate) return;

  const pdf = new jsPDF();

  // ==========================
  // Header
  // ==========================
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text("TalentLens AI", 14, 20);

  pdf.setFontSize(16);
  pdf.text("Candidate Evaluation Report", 14, 30);

  pdf.setDrawColor(123, 48, 72);
  pdf.line(14, 35, 196, 35);

  // ==========================
  // Candidate Details
  // ==========================
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "normal");

  pdf.text(`Candidate: ${selectedCandidate.name}`, 14, 45);
  pdf.text(`Rank: #${selectedCandidate.rank}`, 14, 53);
  pdf.text(`ATS Score: ${selectedCandidate.score}%`, 14, 61);
  const verdict = (selectedCandidate.verdict || "")
  .replace(/[^\x00-\x7F]/g, "");

pdf.text(`Verdict: ${verdict}`, 14, 69);

  // ==========================
  // Resume Summary
  // ==========================
  pdf.setFont("helvetica", "bold");
  pdf.text("Resume Summary", 14, 82);

  pdf.setFont("helvetica", "normal");

  const summary = pdf.splitTextToSize(
    selectedCandidate.resume_summary || "No summary available.",
    180
  );

  pdf.text(summary, 14, 90);

  let y = 90 + summary.length * 7 + 8;

  // ==========================
  // Strengths
  // ==========================
  autoTable(pdf, {
    startY: y,
    head: [["Strengths"]],
    body: (selectedCandidate.strengths || []).map((item) => [
      typeof item === "object" ? item.strength : item,
    ]),
    theme: "grid",
    headStyles: {
      fillColor: [123, 48, 72],
    },
  });

  y = pdf.lastAutoTable.finalY + 10;

  // ==========================
  // Weaknesses
  // ==========================
  autoTable(pdf, {
    startY: y,
    head: [["Weaknesses"]],
    body: (selectedCandidate.weaknesses || []).map((item) => [
      typeof item === "object" ? item.weakness : item,
    ]),
    theme: "grid",
    headStyles: {
      fillColor: [123, 48, 72],
    },
  });

  y = pdf.lastAutoTable.finalY + 10;

  // ==========================
  // Matched Skills
  // ==========================
  autoTable(pdf, {
    startY: y,
    head: [["Matched Skills"]],
    body: (selectedCandidate.matched_skills || []).map((item) => [item]),
    theme: "grid",
    headStyles: {
      fillColor: [46, 125, 50],
    },
  });

  y = pdf.lastAutoTable.finalY + 10;

  // ==========================
  // Missing Skills
  // ==========================
  if (y > 220) {
  pdf.addPage();
  y = 20;
}
  autoTable(pdf, {
    startY: y,
    head: [["Missing Skills"]],
    body: (selectedCandidate.missing_skills || []).map((item) => [item]),
    theme: "grid",
    headStyles: {
      fillColor: [198, 40, 40],
    },
  });

  y = pdf.lastAutoTable.finalY + 10;

  // ==========================
  // Improvements
  // ==========================
  autoTable(pdf, {
    startY: y,
    head: [["Improvement Suggestions"]],
    body: (selectedCandidate.improvements || []).map((item) => [
      typeof item === "object" ? item.improvement : item,
    ]),
    theme: "grid",
    headStyles: {
      fillColor: [194, 149, 91],
    },
  });

  y = pdf.lastAutoTable.finalY + 15;

  // ==========================
  // Footer
  // ==========================
  pdf.setFontSize(10);

  pdf.text(
    `Generated by TalentLens AI | ${new Date().toLocaleDateString()}`,
    14,
    y
  );

  pdf.save(`${selectedCandidate.name}_Report.pdf`);
};

  return (

    <div className="app-layout">

      <Sidebar

        role="recruiter"

        activeTab={activeTab}

        setActiveTab={setActiveTab}

      />

      <div className="main-area">        {activeTab === "dashboard" && (
          <>
            <h1>Recruiter Dashboard</h1>

            <div className="upload-panel">

              <h2>Upload Candidate Resumes</h2>
              <h6 className="upload-tip">
  You can upload multiple resumes. Hold <b>Ctrl</b> (Windows) or <b>⌘ Command</b> (Mac) while selecting files.
</h6>

              <label className="file-upload-label">
                <span>
                  Click to choose one or more resumes (.pdf)
                </span>
                
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={(e) => {
                    const selectedFiles = Array.from(e.target.files || []);
                    setResumes((prevFiles) => {
                      const merged = [...prevFiles];
                      selectedFiles.forEach((file) => {
                        const duplicate = prevFiles.some(
                          (existing) =>
                            existing.name === file.name &&
                            existing.size === file.size &&
                            existing.lastModified === file.lastModified
                        );
                        if (!duplicate) {
                          merged.push(file);
                        }
                      });
                      return merged;
                    });
                    e.target.value = null;
                  }}
                />
              </label>

              {resumes.length > 0 && (
                <div className="selected-file-list">
                  <h3>Selected Resumes</h3>

                  <ul>
                    {resumes.map((file, index) => (
                      <li key={index}>
                        {file.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <textarea
                placeholder="Paste Job Description"
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />

              <button onClick={analyzeResumes}>
                {loading
                  ? "Analyzing..."
                  : "Analyze Candidates"}
              </button>

            </div>

          </>
        )}        {activeTab === "ranks" && (

          <>

            <h1>Candidate Rankings</h1>

            <div className="grid">

              {ranking.map((candidate, index) => (

                <div
                  key={index}
                  className="result-card"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
    setSelectedCandidate(candidate);
    setChatAnalysis(ranking);
    setActiveTab("analysis");
}}
                >

                  <h2>#{candidate.rank}</h2>

                  <h3>{candidate.name}</h3>

                  <h1>{candidate.score}%</h1>

                  <p>{candidate.verdict}</p>

                </div>

              ))}

            </div>

          </>

        )}        {activeTab === "analysis" && selectedCandidate && (

          <>

            <h1>Candidate Analysis</h1>
            <div style={{ marginBottom: "20px" }}>
              <button
                onClick={exportPDF}
                style={{
                  padding: "12px 20px",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  background: "linear-gradient(90deg,#7b3048,#c3955b)",
                  color: "#fff",
                  fontWeight: "600",
                  fontSize: "15px",
                }}
              >
                📄 Export PDF
              </button>
            </div>

            <div className="result-panel" id="analysis-report">

              {/* JD Meta */}
              {selectedCandidate.parsed_jd && selectedCandidate.parsed_jd.job_title !== "Unknown" && (
                <div className="jd-meta-banner">
                  <span className="jd-meta-item">
                    <span className="jd-meta-icon">💼</span>
                    <strong>{selectedCandidate.parsed_jd.job_title}</strong>
                  </span>
                  {selectedCandidate.parsed_jd.seniority !== "unknown" && (
                    <span className="jd-meta-item">
                      <span className="jd-meta-icon">📈</span>
                      {selectedCandidate.parsed_jd.seniority.charAt(0).toUpperCase() + selectedCandidate.parsed_jd.seniority.slice(1)} level
                    </span>
                  )}
                  {selectedCandidate.parsed_jd.years_experience_required > 0 && (
                    <span className="jd-meta-item">
                      <span className="jd-meta-icon">🗓</span>
                      {selectedCandidate.parsed_jd.years_experience_required}+ yrs required
                    </span>
                  )}
                </div>
              )}

              {/* Score card */}
              <div className="result-card ats-score-card">
                <div className="ats-score-layout">
                  <div className="ats-ring-wrap">
                    <svg viewBox="0 0 120 120" className="ats-ring-svg">
                      <circle cx="60" cy="60" r="52" className="ats-ring-bg"/>
                      <circle
                        cx="60" cy="60" r="52"
                        className="ats-ring-fill"
                        strokeDasharray={`${selectedCandidate.score * 3.267} 326.7`}
                        strokeDashoffset="0"
                        transform="rotate(-90 60 60)"
                      />
                    </svg>
                    <div className="ats-ring-inner">
                      <span className="ats-ring-number">{selectedCandidate.score}</span>
                      <span className="ats-ring-denom">/ 100</span>
                    </div>
                  </div>
                  <div className="ats-score-info">
                    <h2 style={{marginBottom:4, color:"#5b6e74"}}>#{selectedCandidate.rank} {selectedCandidate.name}</h2>
                    <div className="ats-verdict-badge">{selectedCandidate.verdict}</div>
                    <p className="ats-confidence-text">Confidence: <strong>{selectedCandidate.confidence}%</strong></p>
                    <div className="ats-components-list">
                      {selectedCandidate.score_components && Object.entries({
                        "Skill Match":          { pts: selectedCandidate.score_components.skill_match,          max: 35 },
                        "Req. Coverage":        { pts: selectedCandidate.score_components.requirement_coverage, max: 30 },
                        "Experience Fit":       { pts: selectedCandidate.score_components.experience_fit,       max: 20 },
                        "Profile Signals":      { pts: selectedCandidate.score_components.profile_signals,      max: 15 },
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

              {/* Resume Summary */}
              <div className="result-card ai-card">
                <h3 className="section-heading">📄 Recruiter Summary</h3>
                <p className="ai-text">{selectedCandidate.resume_summary || "—"}</p>
              </div>

              {/* Semantic Alignment */}
              {selectedCandidate.semantic_similarity && (
                <div className="result-card">
                  <h3 className="section-heading">🧠 Semantic Alignment</h3>
                  <p className="section-subtext">
                    Passage-level similarity between resume and job description.
                  </p>
                  <div className="sem-grid">
                    {[
                      { label: "Overall Document",   key: "overall",            icon: "📄" },
                      { label: "Skills Section",      key: "skills_section",     icon: "🛠" },
                      { label: "Experience Section",  key: "experience_section", icon: "💼" },
                      { label: "Education Section",   key: "education_section",  icon: "🎓" },
                    ].map(({ label, key, icon }) => {
                      const val = selectedCandidate.semantic_similarity[key] ?? 0;
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

              {/* Requirement Coverage */}
              {(selectedCandidate.requirement_coverage || []).length > 0 && (
                <div className="result-card">
                  <h3 className="section-heading">📋 JD Requirement Coverage</h3>
                  <p className="section-subtext">
                    Each JD requirement matched against resume passages via semantic embeddings.
                  </p>
                  <div className="req-coverage-list">
                    {selectedCandidate.requirement_coverage.map((r, i) => {
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
                            <span className={`req-badge ${badgeClass}`}>{r.match_type}</span>
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

              {/* Skills */}
              <div className="grid">
                <div className="result-card">
                  <h3 className="section-heading">✅ Matched Skills</h3>
                  <div className="skill-tag-list">
                    {(selectedCandidate.matched_skills || []).map((skill, i) => (
                      <span key={i} className="skill-tag skill-tag-matched">{skill}</span>
                    ))}
                  </div>
                </div>
                <div className="result-card">
                  <h3 className="section-heading">❌ Missing Skills</h3>
                  <div className="skill-tag-list">
                    {(selectedCandidate.missing_skills || []).map((skill, i) => (
                      <span key={i} className="skill-tag skill-tag-missing">{skill}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Strengths & Weaknesses */}
              <div className="grid">
                <div className="result-card ai-card">
                  <h3 className="section-heading">💪 Strengths</h3>
                  <ul className="ai-list ai-list-strengths">
                    {(selectedCandidate.strengths || []).map((item, i) => (
                      <li key={i}>{typeof item === "object" ? item.strength : item}</li>
                    ))}
                  </ul>
                </div>
                <div className="result-card ai-card">
                  <h3 className="section-heading">⚠️ Weaknesses</h3>
                  <ul className="ai-list ai-list-weaknesses">
                    {(selectedCandidate.weaknesses || []).map((item, i) => (
                      <li key={i}>{typeof item === "object" ? item.weakness : item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Improvements */}
              <div className="result-card ai-card">
                <h3 className="section-heading">🚀 Improvement Suggestions</h3>
                <ol className="ai-list ai-list-improvements">
                  {(selectedCandidate.improvements || []).map((item, i) => (
                    <li key={i}>{typeof item === "object" ? item.improvement : item}</li>
                  ))}
                </ol>
              </div>

              {/* Skill Breakdown */}
              {Object.keys(selectedCandidate.skill_scores || {}).length > 0 && (
                <div className="result-card">
                  <h3 className="section-heading">📊 Skill Breakdown</h3>
                  <div className="skill-breakdown-list">
                    {Object.entries(selectedCandidate.skill_scores || {}).map(([skill, value]) => {
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


        {activeTab === "insights" && (
  <div className="insights-view">
    <h1>Recruitment Analytics Dashboard</h1>

    <div className="analytics-summary" style={{ marginBottom: "25px" }}>
      <div className="result-card small-card" style={{ marginBottom: "20px" }}>
        <h3>Total Candidates</h3>
        <h1>{ranking.length}</h1>
      </div>

      <div className="result-card small-card" style={{ marginBottom: "20px" }}>
        <h3>Average ATS Score</h3>
        <h1>
          {ranking.length
            ? (
                ranking.reduce((a, b) => a + b.score, 0) /
                ranking.length
              ).toFixed(1)
            : 0}
          %
        </h1>
      </div>

      <div
        className="analytics-summary-row"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "20px",
        }}
      >
        <div className="result-card small-card">
          <h3>Highest Score</h3>
          <h1>
            {ranking.length
              ? Math.max(...ranking.map((c) => c.score))
              : 0}
            %
          </h1>
        </div>

        <div className="result-card small-card">
          <h3>Lowest Score</h3>
          <h1>
            {ranking.length
              ? Math.min(...ranking.map((c) => c.score))
              : 0}
            %
          </h1>
        </div>
      </div>
    </div>

    <div className="result-card">
      <h2>🏆 Top 10 Candidates</h2>

      <table className="connect-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Name</th>
            <th>ATS</th>
            <th>Matched</th>
            <th>Missing</th>
            <th>Verdict</th>
          </tr>
        </thead>

        <tbody>
          {ranking.slice(0, 10).map((candidate) => (
            <tr key={candidate.rank}>
              <td>#{candidate.rank}</td>
              <td>{candidate.name}</td>
              <td>{candidate.score}%</td>
              <td>{candidate.matched_skills?.length || 0}</td>
              <td>{candidate.missing_skills?.length || 0}</td>
              <td>{candidate.verdict}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="result-card" style={{ minHeight: 360, marginTop: "25px" }}>
      <h3>🥧 Verdict Distribution</h3>

      {verdictHasData ? (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={verdictData}
              dataKey="value"
              nameKey="name"
              outerRadius={95}
              labelLine={false}
              label
              isAnimationActive={false}
            >
              <Cell fill="#4caf50" />
              <Cell fill="#2196f3" />
              <Cell fill="#ff9800" />
              <Cell fill="#e53935" />
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div
          style={{
            minHeight: 240,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#7a6b63",
            fontSize: "16px",
          }}
        >
          No verdict distribution data available yet.
        </div>
      )}
    </div>
  </div>
)}
{activeTab === "chatbot" && (

  <div className="result-card">

    <Chatbot
      analysisResult={ranking}
    />

  </div>

)}



       {activeTab === "connect" && (

<>
  <div className="connect-panel">
    <div className="connect-header">
      <h1>Connect With Candidates</h1>
      <input
        className="connect-search"
        type="search"
        placeholder="Search by name, resume, email or phone"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
    </div>

    <div className="connect-table-wrapper">
      <table className="connect-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Resume</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Invite</th>
          </tr>
        </thead>
        <tbody>
          {ranking.filter((candidate) => {
            const query = searchQuery.toLowerCase().trim();
            if (!query) return true;
            return [
              candidate.name,
              candidate.resume_name || candidate.name,
              candidate.email,
              candidate.phone,
            ]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(query));
          }).map((candidate, index) => (
            <tr key={index}>
              <td>{candidate.name || "Unknown"}</td>
              <td>{candidate.resume_name || candidate.name || "N/A"}</td>
              <td>{candidate.email || "Not Found"}</td>
              <td>{candidate.phone || "Not Found"}</td>
              <td>
                <a
                  className="invite-link"
                  href={`mailto:${candidate.email}?subject=Interview Invitation&body=Dear Candidate,%0D%0A%0D%0AWe are pleased to invite you for an interview.%0D%0A%0D%0ARegards,%0D%0ATalentLens Recruitment Team`}
                >
                  <button className="connect-button">Send Invite</button>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
</>

)}

      </div>

    </div>

  );

}
