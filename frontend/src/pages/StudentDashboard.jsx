import Sidebar from "../components/Sidebar";
import { useEffect, useRef, useState } from "react";
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
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: "smooth",
  });

  document.querySelector(".main-area")?.scrollTo({
    top: 0,
    left: 0,
    behavior: "smooth",
  });
}, [activeTab]);
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