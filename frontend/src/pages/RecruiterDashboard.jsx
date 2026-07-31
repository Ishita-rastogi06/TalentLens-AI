import Sidebar from "../components/Sidebar";
import { useState } from "react";
import Chatbot from "../components/Chatbot";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

function AnalysisScoreCard({ candidate }) {
  const count = (items) => (Array.isArray(items) ? items.length : 0);
  const clamp = (value) => Math.min(1, Math.max(0, value));
  const score = Math.round(Number(candidate?.score || 0));
  const matched = count(candidate?.matched_skills);
  const missing = count(candidate?.missing_skills);
  const strengths = count(candidate?.strengths);
  const weaknesses = count(candidate?.weaknesses);
  const skillRatio = clamp(matched / Math.max(matched + missing, 1));
  const experienceRatio = clamp(strengths / Math.max(strengths + weaknesses, 1));
  const profileRatio = clamp(
    (matched + strengths) / Math.max(matched + missing + strengths + weaknesses, 1)
  );
  const metrics = [
    { label: "Skill Match", ratio: skillRatio, total: 35 },
    { label: "Requirement Coverage", ratio: skillRatio, total: 20 },
    { label: "Experience Fit", ratio: experienceRatio, total: 20 },
    { label: "Profile Signals", ratio: profileRatio, total: 25 },
  ];
  const label =
    score >= 75
      ? "Strong Match"
      : score >= 50
        ? "Good Match"
        : score >= 30
          ? "Average Match"
          : "Needs Improvement";

  return (
    <section className="analysis-score-card">
      <div
        className="analysis-score-ring"
        style={{ "--analysis-score-angle": `${score * 3.6}deg` }}
      >
        <div className="analysis-score-ring__inner">
          <strong>{score}</strong>
          <span>/100</span>
        </div>
      </div>
      <div className="analysis-score-details">
        <span className="analysis-match-label"><i></i>{label}</span>
        <p className="analysis-confidence">
          {candidate?.name || "This candidate"}&apos;s current alignment with the job description.
        </p>
        <div className="analysis-metrics">
          {metrics.map((metric) => {
            const points = Math.round(metric.ratio * metric.total);
            return (
              <div className="analysis-metric" key={metric.label}>
                <span className="analysis-metric__name">{metric.label}</span>
                <span className="analysis-metric__track">
                  <span
                    className="analysis-metric__fill"
                    style={{ width: `${metric.ratio * 100}%` }}
                  />
                </span>
                <span className="analysis-metric__value">{points}/{metric.total}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AnalysisHighlightCard({ className, icon, eyebrow, title, items }) {
  const safeItems = Array.isArray(items) ? items : [];
  const itemText = (item) => {
    if (typeof item !== "object" || item === null) return String(item ?? "");
    return String(item.strength || item.weakness || item.improvement || JSON.stringify(item));
  };

  return (
    <article className={`analysis-highlight-card ${className}`}>
      <div className="analysis-highlight-top">
        <span className="analysis-highlight-icon" aria-hidden="true">{icon}</span>
        <div>
          <span className="analysis-card-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        <span className="analysis-count">{safeItems.length}</span>
      </div>
      {className === "matched-card" || className === "missing-card" ? (
        <div className="analysis-skill-chips">
          {safeItems.length ? (
            safeItems.map((item, index) => (
              <span className="analysis-skill-chip" key={index}>{itemText(item)}</span>
            ))
          ) : (
            <span className="analysis-skill-chip">No items found</span>
          )}
        </div>
      ) : (
        <ul className="analysis-insight-list">
          {safeItems.length ? (
            safeItems.map((item, index) => <li key={index}>{itemText(item)}</li>)
          ) : (
            <li>No items found</li>
          )}
        </ul>
      )}
    </article>
  );
}

export default function RecruiterDashboard() {
  const [resumes, setResumes] = useState([]);
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [ranking, setRanking] = useState([]);
  const [chatAnalysis, setChatAnalysis] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  // Mirrors the Candidate Analysis canvas (#F5F0E7) for full-page recruiter views.
  // The Analysis view receives this same canvas through its scoped theme selector.
  const analysisCanvasStyle = { background: "#F5F0E7" };
  const useAnalysisCanvas = ["ranks", "insights", "connect"].includes(activeTab);

  const totalCandidates = ranking.length;
  const averageScore = totalCandidates > 0
    ? ranking.reduce((sum, candidate) => sum + candidate.score, 0) / totalCandidates
    : 0;
  const highestScore = totalCandidates > 0 ? Math.max(...ranking.map((candidate) => candidate.score)) : 0;
  const lowestScore = totalCandidates > 0 ? Math.min(...ranking.map((candidate) => candidate.score)) : 0;

  const verdictData = [
    { name: "Excellent", value: ranking.filter((candidate) => candidate.verdict?.toLowerCase().includes("excellent")).length },
    { name: "Good", value: ranking.filter((candidate) => candidate.verdict?.toLowerCase().includes("good")).length },
    { name: "Average", value: ranking.filter((candidate) => candidate.verdict?.toLowerCase().includes("average")).length },
    { name: "Poor", value: ranking.filter((candidate) => candidate.verdict?.toLowerCase().includes("poor")).length },
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
    resumes.forEach((file) => formData.append("resume", file));
    formData.append("job_description", jd);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      console.log(data);
      if (data.ranking) {
        setRanking(data.ranking);
        setActiveTab("ranks");
      }
    } catch (err) {
      console.log(err);
      if (err.name === "AbortError") {
        alert("Analysis taking too long. Please check backend is running on http://127.0.0.1:8000");
      } else {
        alert("Backend Error: " + err.message);
      }
    }
    setLoading(false);
  };

  const exportPDF = () => {
    if (!selectedCandidate) return;
    const pdf = new jsPDF();

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text("TalentLens AI", 14, 20);
    pdf.setFontSize(16);
    pdf.text("Candidate Evaluation Report", 14, 30);
    pdf.setDrawColor(123, 48, 72);
    pdf.line(14, 35, 196, 35);

    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Candidate: ${selectedCandidate.name}`, 14, 45);
    pdf.text(`Rank: #${selectedCandidate.rank}`, 14, 53);
    pdf.text(`ATS Score: ${selectedCandidate.score}%`, 14, 61);
    const verdict = (selectedCandidate.verdict || "").replace(/[^\x00-\x7F]/g, "");
    pdf.text(`Verdict: ${verdict}`, 14, 69);

    pdf.setFont("helvetica", "bold");
    pdf.text("Resume Summary", 14, 82);
    pdf.setFont("helvetica", "normal");
    const summary = pdf.splitTextToSize(selectedCandidate.resume_summary || "No summary available.", 180);
    pdf.text(summary, 14, 90);
    let y = 90 + summary.length * 7 + 8;

    autoTable(pdf, { startY: y, head: [["Strengths"]], body: (selectedCandidate.strengths || []).map((item) => [typeof item === "object" ? item.strength : item]), theme: "grid", headStyles: { fillColor: [123, 48, 72] } });
    y = pdf.lastAutoTable.finalY + 10;
    autoTable(pdf, { startY: y, head: [["Weaknesses"]], body: (selectedCandidate.weaknesses || []).map((item) => [typeof item === "object" ? item.weakness : item]), theme: "grid", headStyles: { fillColor: [123, 48, 72] } });
    y = pdf.lastAutoTable.finalY + 10;
    autoTable(pdf, { startY: y, head: [["Matched Skills"]], body: (selectedCandidate.matched_skills || []).map((item) => [item]), theme: "grid", headStyles: { fillColor: [46, 125, 50] } });
    y = pdf.lastAutoTable.finalY + 10;
    if (y > 220) { pdf.addPage(); y = 20; }
    autoTable(pdf, { startY: y, head: [["Missing Skills"]], body: (selectedCandidate.missing_skills || []).map((item) => [item]), theme: "grid", headStyles: { fillColor: [198, 40, 40] } });
    y = pdf.lastAutoTable.finalY + 10;
    autoTable(pdf, { startY: y, head: [["Improvement Suggestions"]], body: (selectedCandidate.improvements || []).map((item) => [typeof item === "object" ? item.improvement : item]), theme: "grid", headStyles: { fillColor: [194, 149, 91] } });
    y = pdf.lastAutoTable.finalY + 15;
    pdf.setFontSize(10);
    pdf.text(`Generated by TalentLens AI | ${new Date().toLocaleDateString()}`, 14, y);
    pdf.save(`${selectedCandidate.name}_Report.pdf`);
  };

  return (
    <div className="app-layout">
      <Sidebar role="recruiter" activeTab={activeTab} setActiveTab={setActiveTab} />
      <div
        className="main-area"
        style={useAnalysisCanvas ? analysisCanvasStyle : undefined}
      >
        {activeTab === "dashboard" && (
          <>
            <h1>Recruiter Dashboard</h1>
            <div className="upload-panel">
              <h2>Upload Candidate Resumes</h2>
              <h6 className="upload-tip">You can upload multiple resumes. Hold <b>Ctrl</b> (Windows) or <b>⌘ Command</b> (Mac) while selecting files.</h6>
              <label className="file-upload-label">
                <span>Click to choose one or more resumes (.pdf)</span>
                <input type="file" accept=".pdf" multiple onChange={(e) => {
                  const selectedFiles = Array.from(e.target.files || []);
                  setResumes((previousFiles) => {
                    const merged = [...previousFiles];
                    selectedFiles.forEach((file) => {
                      const duplicate = previousFiles.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified);
                      if (!duplicate) merged.push(file);
                    });
                    return merged;
                  });
                  e.target.value = null;
                }} />
              </label>
              {resumes.length > 0 && <div className="selected-file-list"><h3>Selected Resumes</h3><ul>{resumes.map((file, index) => <li key={index}>{file.name}</li>)}</ul></div>}
              <textarea placeholder="Paste Job Description" value={jd} onChange={(e) => setJd(e.target.value)} />
              <button onClick={analyzeResumes}>{loading ? "Analyzing..." : "Analyze Candidates"}</button>
            </div>
          </>
        )}

        {activeTab === "ranks" && (
          <>
            <h1 style={{ color: "#123549", textAlign: "left", fontSize: "42px", marginTop: "24px", marginBottom: "28px" }}>Candidate Rankings</h1>
            <div className="grid" style={{ gap: "22px", marginTop: 0 }}>
              {ranking.map((candidate, index) => (
                <div
                  key={index}
                  className="result-card"
                  style={{ cursor: "pointer", marginTop: 0, padding: "28px", background: "#fffdf9", color: "#123549", border: "1.5px solid #d7ae88", borderLeft: "6px solid #bc965d", borderRadius: "20px", boxShadow: "0 8px 18px rgba(80, 32, 58, 0.10)" }}
                  onClick={() => { setSelectedCandidate(candidate); setChatAnalysis(ranking); setActiveTab("analysis"); }}
                >
                  <h2 style={{ color: "#6e1837", fontSize: "34px", marginBottom: "10px" }}>#{candidate.rank}</h2>
                  <h3 style={{ color: "#123549", fontSize: "22px", marginBottom: "14px" }}>{candidate.name}</h3>
                  <h1 style={{ color: "#8b6044", fontSize: "36px", textAlign: "left", margin: "0 0 10px" }}>{candidate.score}%</h1>
                  <p style={{ color: "#50203a", margin: 0, fontWeight: 600 }}>{candidate.verdict}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "analysis" && selectedCandidate && (
          <>
            <h1>Candidate Analysis</h1>
            <div style={{ marginBottom: "20px" }}><button onClick={exportPDF} style={{ padding: "12px 20px", border: "none", borderRadius: "10px", cursor: "pointer", background: "linear-gradient(90deg,#7b3048,#c3955b)", color: "#fff", fontWeight: "600", fontSize: "15px" }}>📄 Export PDF</button></div>
            <div className="result-panel" id="analysis-report">
              <div className="result-card analysis-detail-card">
                <h2>#{selectedCandidate.rank} {selectedCandidate.name || "Unknown Candidate"}</h2>
                <p>{selectedCandidate.resume_name || "Candidate resume"} · {selectedCandidate.verdict || "Evaluation in progress"}</p>
              </div>
              <AnalysisScoreCard candidate={selectedCandidate} />
              <section className="analysis-highlights">
                <AnalysisHighlightCard className="matched-card" icon="✓" eyebrow="SKILLS ALIGNED" title="Matched Skills" items={selectedCandidate.matched_skills} />
                <AnalysisHighlightCard className="missing-card" icon="+" eyebrow="GROWTH OPPORTUNITIES" title="Missing Skills" items={selectedCandidate.missing_skills} />
                <AnalysisHighlightCard className="strength-card" icon="✦" eyebrow="WHAT STANDS OUT" title="Strengths" items={selectedCandidate.strengths} />
                <AnalysisHighlightCard className="weakness-card" icon="!" eyebrow="NEEDS ATTENTION" title="Weaknesses" items={selectedCandidate.weaknesses} />
              </section>
              <div className="result-card analysis-detail-card"><h3>📄 Resume Summary</h3><p>{selectedCandidate.resume_summary || "No summary available."}</p></div>
              <div className="result-card analysis-detail-card analysis-improvement-card"><h3>🚀 Improvement Suggestions</h3><ul>{(selectedCandidate.improvements || []).map((item, index) => <li key={index}>{typeof item === "object" ? item.improvement : item}</li>)}</ul></div>
              {selectedCandidate.reasoning && <div className="result-card analysis-detail-card"><h3>📌 Why this Score?</h3><p>{selectedCandidate.reasoning}</p></div>}
              <div className="result-card analysis-detail-card analysis-skill-breakdown-card"><h3>📊 Skill Breakdown</h3>{Object.entries(selectedCandidate.skill_scores || {}).map(([skill, value]) => <div key={skill} style={{ marginBottom: "18px" }}><div style={{ display: "flex", justifyContent: "space-between" }}><span>{skill}</span><span>{value}%</span></div><div className="progress"><div className="progress-fill" style={{ width: `${value}%` }}></div></div></div>)}</div>
            </div>
          </>
        )}

        {activeTab === "insights" && (
          <div className="insights-view" style={{ maxWidth: "920px", color: "#123549" }}>
            <h1 style={{ textAlign: "center", color: "#123549", fontSize: "42px", marginBottom: "30px" }}>Recruitment Analytics Dashboard</h1>
            <div className="analytics-summary" style={{ maxWidth: "760px", marginBottom: "25px" }}>
              <div className="result-card small-card" style={{ marginBottom: "20px", background: "#fffaf5", border: "1px solid #ead8cb", borderTop: "5px solid #6e1837", boxShadow: "0 10px 24px rgba(80, 32, 58, 0.10)" }}><h3 style={{ color: "#6e1837" }}>Total Candidates</h3><h1 style={{ color: "#123549" }}>{totalCandidates}</h1></div>
              <div className="result-card small-card" style={{ marginBottom: "20px", background: "#fffaf5", border: "1px solid #ead8cb", borderTop: "5px solid #bc965d", boxShadow: "0 10px 24px rgba(80, 32, 58, 0.10)" }}><h3 style={{ color: "#6e1837" }}>Average ATS Score</h3><h1 style={{ color: "#123549" }}>{totalCandidates ? averageScore.toFixed(1) : 0}%</h1></div>
              <div className="analytics-summary-row" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "20px" }}><div className="result-card small-card" style={{ background: "#f7eee7", border: "1px solid #ead8cb", boxShadow: "0 8px 20px rgba(80, 32, 58, 0.08)" }}><h3 style={{ color: "#6e1837" }}>Highest Score</h3><h1 style={{ color: "#8b6044" }}>{highestScore}%</h1></div><div className="result-card small-card" style={{ background: "#f7eee7", border: "1px solid #ead8cb", boxShadow: "0 8px 20px rgba(80, 32, 58, 0.08)" }}><h3 style={{ color: "#6e1837" }}>Lowest Score</h3><h1 style={{ color: "#8b6044" }}>{lowestScore}%</h1></div></div>
            </div>
            <div className="result-card" style={{ background: "#fffaf5", border: "1px solid #ead8cb", boxShadow: "0 12px 28px rgba(80, 32, 58, 0.10)" }}><h2 style={{ color: "#6e1837" }}>🏆 Top 10 Candidates</h2><table className="connect-table" style={{ background: "#fffaf5" }}><thead><tr><th style={{ color: "#fffaf5", background: "#50203a" }}>Rank</th><th style={{ color: "#fffaf5", background: "#50203a" }}>Name</th><th style={{ color: "#fffaf5", background: "#50203a" }}>ATS</th><th style={{ color: "#fffaf5", background: "#50203a" }}>Matched</th><th style={{ color: "#fffaf5", background: "#50203a" }}>Missing</th><th style={{ color: "#fffaf5", background: "#50203a" }}>Verdict</th></tr></thead><tbody>{ranking.slice(0, 10).map((candidate) => <tr key={candidate.rank}><td style={{ color: "#123549", borderBottomColor: "#ead8cb" }}>#{candidate.rank}</td><td style={{ color: "#123549", borderBottomColor: "#ead8cb" }}>{candidate.name}</td><td style={{ color: "#8b6044", borderBottomColor: "#ead8cb", fontWeight: 700 }}>{candidate.score}%</td><td style={{ color: "#123549", borderBottomColor: "#ead8cb" }}>{candidate.matched_skills?.length || 0}</td><td style={{ color: "#123549", borderBottomColor: "#ead8cb" }}>{candidate.missing_skills?.length || 0}</td><td style={{ color: "#6e1837", borderBottomColor: "#ead8cb", fontWeight: 600 }}>{candidate.verdict}</td></tr>)}</tbody></table></div>
            <div className="result-card" style={{ minHeight: 360, marginTop: "25px", background: "#fffaf5", border: "1px solid #ead8cb", boxShadow: "0 12px 28px rgba(80, 32, 58, 0.10)" }}><h3 style={{ color: "#6e1837" }}>🥧 Verdict Distribution</h3>{verdictHasData ? <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={verdictData} dataKey="value" nameKey="name" outerRadius={95} labelLine={false} label isAnimationActive={false}><Cell fill="#6e1837" /><Cell fill="#bc965d" /><Cell fill="#ead8cb" /><Cell fill="#8b6044" /></Pie><Tooltip /></PieChart></ResponsiveContainer> : <div style={{ minHeight: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "#50203a", fontSize: "16px" }}>No verdict distribution data available yet.</div>}</div>
          </div>
        )}

        {activeTab === "chatbot" && <div className="result-card" style={{ marginTop: "25px" }}><Chatbot analysisResult={ranking} /></div>}

        {activeTab === "connect" && <div className="connect-panel" style={{ margin: "24px auto 0", background: "#fffaf5", border: "1px solid #d7ae88", boxShadow: "0 10px 24px rgba(80, 32, 58, 0.10)" }}><div className="connect-header"><h1 style={{ color: "#123549" }}>Connect With Candidates</h1><input className="connect-search" style={{ background: "#fffaf5", borderColor: "#bc965d", color: "#123549" }} type="search" placeholder="Search by name, resume, email or phone" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div><div className="connect-table-wrapper"><table className="connect-table" style={{ background: "#fffaf5" }}><thead><tr><th style={{ color: "#fffaf5", background: "#50203a" }}>Name</th><th style={{ color: "#fffaf5", background: "#50203a" }}>Resume</th><th style={{ color: "#fffaf5", background: "#50203a" }}>Email</th><th style={{ color: "#fffaf5", background: "#50203a" }}>Phone</th><th style={{ color: "#fffaf5", background: "#50203a" }}>Invite</th></tr></thead><tbody>{ranking.filter((candidate) => { const query = searchQuery.toLowerCase().trim(); if (!query) return true; return [candidate.name, candidate.resume_name || candidate.name, candidate.email, candidate.phone].filter(Boolean).some((value) => value.toLowerCase().includes(query)); }).map((candidate, index) => <tr key={index}><td style={{ color: "#123549", borderBottomColor: "#ead8cb" }}>{candidate.name || "Unknown"}</td><td style={{ color: "#123549", borderBottomColor: "#ead8cb" }}>{candidate.resume_name || candidate.name || "N/A"}</td><td style={{ color: "#123549", borderBottomColor: "#ead8cb" }}>{candidate.email || "Not Found"}</td><td style={{ color: "#123549", borderBottomColor: "#ead8cb" }}>{candidate.phone || "Not Found"}</td><td style={{ borderBottomColor: "#ead8cb" }}><a className="invite-link" href={`mailto:${candidate.email}?subject=Interview Invitation&body=Dear Candidate,%0D%0A%0D%0AWe are pleased to invite you for an interview.%0D%0A%0D%0ARegards,%0D%0ATalentLens Recruitment Team`}><button className="connect-button" style={{ background: "#6e1837", color: "#fffaf5", boxShadow: "0 4px 10px rgba(80, 32, 58, 0.18)" }}>Send Invite</button></a></td></tr>)}</tbody></table></div></div>}
      </div>
    </div>
  );
}
