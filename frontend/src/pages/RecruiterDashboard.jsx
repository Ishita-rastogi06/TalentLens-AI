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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

      const response = await fetch(

        "http://127.0.0.1:8000/analyze",

        {

          method: "POST",

          body: formData,
          signal: controller.signal,

        }

      );

      clearTimeout(timeoutId);

      const data = await response.json();

      console.log(data);

      if (data.ranking) {

        setRanking(data.ranking);

        setActiveTab("ranks");

      }

    }

    catch (err) {

      console.log(err);
      if (err.name === 'AbortError') {
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

            <div
  className="result-panel"
  id="analysis-report"
>

              <div className="result-card">

                <h2>
                  #{selectedCandidate.rank} {selectedCandidate.name}
                </h2>

                <h1>{selectedCandidate.score}%</h1>

                <h3>{selectedCandidate.verdict}</h3>

                <br />

                <div className="progress">

                  <div
                    className="progress-fill"
                    style={{
                      width: `${selectedCandidate.score}%`,
                    }}
                  ></div>

                </div>

              </div>



              <div className="grid">

                <div className="result-card">

                  <h3>✅ Matched Skills</h3>

                  <ul>

                    {(selectedCandidate.matched_skills || []).map((skill, index) => (

                      <li key={index}>{skill}</li>

                    ))}

                  </ul>

                </div>



                <div className="result-card">

                  <h3>❌ Missing Skills</h3>

                  <ul>

                    {(selectedCandidate.missing_skills || []).map((skill, index) => (

                      <li key={index}>{skill}</li>

                    ))}

                  </ul>

                </div>

              </div>



              <div className="grid">

                <div className="result-card">

                  <h3>💪 Strengths</h3>

                  <ul>

                    {(selectedCandidate.strengths || []).map((item, index) => (

                      <li key={index}>

                        {typeof item === "object" ? item.strength : item}

                      </li>

                    ))}

                  </ul>

                </div>



                <div className="result-card">

                  <h3>⚠ Weaknesses</h3>

                  <ul>

                    {(selectedCandidate.weaknesses || []).map((item, index) => (

                      <li key={index}>

                        {typeof item === "object" ? item.weakness : item}

                      </li>

                    ))}

                  </ul>

                </div>

              </div>              <div className="result-card">

                <h3>📄 Resume Summary</h3>

                <p>{selectedCandidate.resume_summary}</p>

              </div>



              <div className="result-card">

                <h3>🚀 Improvement Suggestions</h3>

                <ul>

                  {(selectedCandidate.improvements || []).map((item, index) => (

                    <li key={index}>

                      {typeof item === "object" ? item.improvement : item}

                    </li>

                  ))}

                </ul>

              </div>



              <div className="result-card">

                <h3>📊 Skill Breakdown</h3>

                {Object.entries(selectedCandidate.skill_scores || {}).map(

                  ([skill, value]) => (

                    <div key={skill} style={{ marginBottom: "18px" }}>

                      <p>

                        {skill} : {value}%

                      </p>

                      <div className="progress">

                        <div
                          className="progress-fill"
                          style={{
                            width: `${value}%`,
                          }}
                        ></div>

                      </div>

                    </div>

                  )

                )}

              </div>

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
