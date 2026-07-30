import Sidebar from "../components/Sidebar";
import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Chatbot from "../components/Chatbot";
import InsightsView from "../components/InsightsView";

function AnalysisScoreCard({ result }) {
  const count = (items) => (Array.isArray(items) ? items.length : 0);
  const clamp = (value) => Math.min(1, Math.max(0, value));
  const score = Math.round(Number(result?.score || 0));
  const matched = count(result?.matched_skills);
  const missing = count(result?.missing_skills);
  const strengths = count(result?.strengths);
  const weaknesses = count(result?.weaknesses);
  const skillRatio = clamp(matched / Math.max(matched + missing, 1));
  const experienceRatio = clamp(strengths / Math.max(strengths + weaknesses, 1));
  const profileRatio = clamp((matched + strengths) / Math.max(matched + missing + strengths + weaknesses, 1));
  const metrics = [
    { label: "Skill Match", ratio: skillRatio, total: 35 },
    { label: "Requirement Coverage", ratio: skillRatio, total: 20 },
    { label: "Experience Fit", ratio: experienceRatio, total: 20 },
    { label: "Profile Signals", ratio: profileRatio, total: 25 },
  ];
  const label = score >= 75 ? "Strong Match" : score >= 50 ? "Good Match" : score >= 30 ? "Average Match" : "Needs Improvement";

  return (
    <section className="analysis-score-card">
      <div className="analysis-score-ring" style={{ "--analysis-score-angle": `${score * 3.6}deg` }}>
        <div className="analysis-score-ring__inner"><strong>{score}</strong><span>/100</span></div>
      </div>
      <div className="analysis-score-details">
        <span className="analysis-match-label"><i></i>{label}</span>
        <p className="analysis-confidence">Your resume's current alignment with this job description.</p>
        <div className="analysis-metrics">
          {metrics.map((metric) => {
            const points = Math.round(metric.ratio * metric.total);
            return (
              <div className="analysis-metric" key={metric.label}>
                <span className="analysis-metric__name">{metric.label}</span>
                <span className="analysis-metric__track"><span className="analysis-metric__fill" style={{ width: `${metric.ratio * 100}%` }} /></span>
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
  return (
    <article className={`analysis-highlight-card ${className}`}>
      <div className="analysis-highlight-top">
        <span className="analysis-highlight-icon" aria-hidden="true">{icon}</span>
        <div><span className="analysis-card-eyebrow">{eyebrow}</span><h3>{title}</h3></div>
        <span className="analysis-count">{safeItems.length}</span>
      </div>
      {className === "matched-card" || className === "missing-card" ? (
        <div className="analysis-skill-chips">
          {safeItems.length ? safeItems.map((item, index) => <span className="analysis-skill-chip" key={index}>{item}</span>) : <span className="analysis-skill-chip">No items found</span>}
        </div>
      ) : (
        <ul className="analysis-insight-list">
          {safeItems.length ? safeItems.map((item, index) => <li key={index}>{typeof item === "object" ? (item.strength || item.weakness || item.improvement || JSON.stringify(item)) : item}</li>) : <li>No items found</li>}
        </ul>
      )}
    </article>
  );
}

export default function StudentDashboard() {

  const [resume, setResume] = useState(null);
  const [jd, setJd] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelector(".main-area")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);
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

            <h1>
              Resume Analysis
            </h1>

            <div className="result-panel">

              <AnalysisScoreCard result={result} />

              <section className="analysis-highlights">
                <AnalysisHighlightCard className="matched-card" icon="✓" eyebrow="SKILLS ALIGNED" title="Matched Skills" items={result.matched_skills} />
                <AnalysisHighlightCard className="missing-card" icon="+" eyebrow="GROWTH OPPORTUNITIES" title="Missing Skills" items={result.missing_skills} />
                <AnalysisHighlightCard className="strength-card" icon="✦" eyebrow="WHAT STANDS OUT" title="Strengths" items={result.strengths} />
                <AnalysisHighlightCard className="weakness-card" icon="!" eyebrow="NEEDS ATTENTION" title="Weaknesses" items={result.weaknesses} />
              </section>              <div className="result-card analysis-detail-card">

                <h3>📄 Resume Summary</h3>

                <p>
                  {result.resume_summary}
                </p>

              </div>



              <div className="result-card analysis-detail-card analysis-improvement-card">

                <h3>🚀 Improvement Suggestions</h3>

                <ul>

                  {(result.improvements || []).map((item,i)=>(

                    <li key={i}>

                      {
                        typeof item==="object"
                        ?
                        item.improvement
                        :
                        item
                      }

                    </li>

                  ))}

                </ul>

              </div>



              <div className="result-card analysis-detail-card">

                <h3>📌 Why this Score?</h3>

                <p>
                  {result.reasoning}
                </p>

              </div>



              <div className="result-card analysis-detail-card analysis-skill-breakdown-card">

                <h3>📊 Skill Breakdown</h3>

                {

                  Object.entries(result.skill_scores || {}).map(

                    ([skill,value])=>(

                      <div
                        key={skill}
                        style={{marginBottom:18}}
                      >

                        <div
                          style={{
                            display:"flex",
                            justifyContent:"space-between"
                          }}
                        >

                          <span>{skill}</span>

                          <span>{value}%</span>

                        </div>

                        <div className="progress">

                          <div
                            className="progress-fill"
                            style={{
                              width:`${value}%`
                            }}
                          ></div>

                        </div>

                      </div>

                    )

                  )

                }

              </div>

            </div>

          </>

        )}



        {activeTab === "export" && (
  <section className="export-report-card">
    <div className="export-report-card__glow export-report-card__glow--one"></div>
    <div className="export-report-card__glow export-report-card__glow--two"></div>

    <div className="export-report-card__header">
      <div className="export-report-card__icon" aria-hidden="true">📄</div>
      <div>
        <span className="export-report-card__eyebrow">TALENTLENS REPORT CENTER</span>
        <h2>Your resume report is ready</h2>
        <p>A polished, share-ready summary of your AI resume analysis.</p>
      </div>
      <span className="export-report-card__ready-badge">● PDF READY</span>
    </div>

    <div className="export-report-card__snapshot" aria-label="Report snapshot">
      <div className="export-snapshot-item">
        <span className="export-snapshot-icon" aria-hidden="true">◎</span>
        <div><strong>ATS evaluation</strong><small>Score & match details</small></div>
      </div>
      <div className="export-snapshot-item">
        <span className="export-snapshot-icon" aria-hidden="true">✦</span>
        <div><strong>Skills review</strong><small>Matched & missing skills</small></div>
      </div>
      <div className="export-snapshot-item">
        <span className="export-snapshot-icon" aria-hidden="true">↗</span>
        <div><strong>Action plan</strong><small>Personalized improvements</small></div>
      </div>
    </div>

    <div className="export-report-card__content-grid">
      <div className="export-report-card__includes">
        <span className="export-report-card__includes-title">WHAT’S INSIDE YOUR PDF</span>
        <ul className="export-report-checklist">
          <li>ATS score and resume match evaluation</li>
          <li>Skill strengths, gaps, and key insights</li>
          <li>Clear recommendations to improve your resume</li>
        </ul>
      </div>

      <aside className="export-report-tip">
        <span className="export-report-tip__label">✦ QUICK TIP</span>
        <p>Use measurable results in your experience section—for example, “improved response time by 25%.”</p>
      </aside>
    </div>

    <div className="export-report-card__footer">
      <div className="export-report-card__note">
        <span className="export-report-card__note-icon">✓</span>
        Ready to save, print, or share with a mentor
      </div>
      <button className="export-report-card__button" onClick={downloadReport}>
        <span>Download PDF Report</span>
        <span className="export-report-card__arrow" aria-hidden="true">↓</span>
      </button>
    </div>
  </section>
)}

{activeTab === "insights" && result && (
  <InsightsView result={result} />
)}

        {activeTab === "chatbot" && (
  <Chatbot analysisResult={result} />
)}



      </div>

    </div>

  );

}