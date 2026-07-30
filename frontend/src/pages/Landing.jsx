import { useNavigate } from "react-router-dom";
import "../styles/theme.css";
import "../styles/landing-pro.css";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing-pro">
      <section className="hero-pro">
        <div className="hero-content">
          <h1 className="hero-title-pro">Your AI Resume<br /><span className="gradient-text">Career Coach</span></h1>
          <p className="hero-subtitle">Get instant AI feedback on your resume. Rank candidates in seconds. Powered by semantic intelligence, not just keywords.</p>
          <div className="hero-cta">
            <button className="cta-primary" onClick={() => navigate("/student")}>📝&nbsp; I&apos;m a Student</button>
            <button className="cta-secondary" onClick={() => navigate("/recruiter")}>👔&nbsp; I&apos;m a Recruiter</button>
          </div>
        </div>

        <div className="hero-visual" aria-label="Resume score preview">
          <div className="hero-showcase">
            <div className="showcase-item">
              <div className="showcase-label">Resume Score</div>
              <div className="showcase-meter"><div className="meter-bar" style={{ width: "87%" }} /></div>
              <div className="showcase-value">87/100</div>
            </div>
            <div className="showcase-item">
              <div className="showcase-label">Semantic Match</div>
              <div className="showcase-meter"><div className="meter-bar" style={{ width: "92%" }} /></div>
              <div className="showcase-value">92%</div>
            </div>
            <div className="showcase-item">
              <div className="showcase-label">Top Skills Found</div>
              <div className="skills-found"><span>Python</span><span>React</span><span>FastAPI</span></div>
            </div>
            <div className="showcase-item full-width">
              <div className="showcase-label">Requirement Coverage</div>
              <div className="coverage-bars">
                <div className="coverage-item"><span>Skills</span><div className="bar-thin"><i style={{ width: "85%" }} /></div></div>
                <div className="coverage-item"><span>Requirements</span><div className="bar-thin"><i style={{ width: "78%" }} /></div></div>
                <div className="coverage-item"><span>Experience</span><div className="bar-thin"><i style={{ width: "88%" }} /></div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-section" aria-label="TalentLens statistics">
        <div className="stat-card"><div className="stat-number">50K+</div><div className="stat-label">Resumes Analyzed</div></div>
        <div className="stat-card"><div className="stat-number">4</div><div className="stat-label">Score Components</div></div>
        <div className="stat-card"><div className="stat-number">30sec</div><div className="stat-label">Time to Analyze</div></div>
        <div className="stat-card"><div className="stat-number">99%</div><div className="stat-label">Accuracy Rate</div></div>
      </section>

      <section className="how-it-works">
        <p className="section-kicker">A CLEARER WAY FORWARD</p><h2>How TalentLens Works</h2>
        <div className="timeline">
          <div className="timeline-item"><div className="timeline-number">1</div><div className="timeline-content"><h3>Upload &amp; Paste</h3><p>Your resume + job description</p></div></div>
          <div className="timeline-arrow">→</div>
          <div className="timeline-item"><div className="timeline-number">2</div><div className="timeline-content"><h3>AI Analysis</h3><p>Semantic matching powered by AI</p></div></div>
          <div className="timeline-arrow">→</div>
          <div className="timeline-item"><div className="timeline-number">3</div><div className="timeline-content"><h3>Get Feedback</h3><p>Detailed score + actionable insights</p></div></div>
        </div>
      </section>

      <section className="features-interactive">
        <p className="section-kicker">BUILT FOR BETTER DECISIONS</p><h2>What Makes TalentLens Different?</h2>
        <div className="features-showcase">
          <div className="feature-large"><div className="feature-icon-large">🧠</div><h3>Semantic Intelligence</h3><p>Understands meaning, not just keywords. “AWS deployment” matches “cloud experience”.</p><div className="feature-example"><span className="example-label">UNDERSTANDS CONTEXT</span><span className="example-text">“Built microservices” = “Backend development”</span></div></div>
          <div className="features-grid-2">
            <div className="feature-card-compact"><div className="icon-badge">⚡</div><h4>Instant Results</h4><p>Full analysis in 60 seconds</p></div>
            <div className="feature-card-compact"><div className="icon-badge">◎</div><h4>4 Score Components</h4><p>Skill, requirements, experience, profile</p></div>
            <div className="feature-card-compact"><div className="icon-badge">✦</div><h4>AI Feedback</h4><p>Strengths, gaps, improvements</p></div>
            <div className="feature-card-compact"><div className="icon-badge">↗</div><h4>Bulk Ranking</h4><p>100 resumes ranked in seconds</p></div>
          </div>
        </div>
      </section>

      <section className="role-section student-pro">
        <div className="role-visual student-visual-new"><div className="score-ring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="90" className="ring-bg" /><circle cx="100" cy="100" r="90" className="ring-progress" /></svg><div className="ring-text">87%</div></div></div>
        <div className="role-content"><div className="role-badge student-badge">👨‍🎓 Student</div><h2>Know Your Resume Score</h2><p>Get AI-powered feedback on how your resume performs against any job.</p><ul className="role-benefits"><li>See your ATS score breakdown</li><li>Find missing skills &amp; requirements</li><li>Get specific improvement tips</li><li>Download your analysis PDF</li></ul><button className="role-cta" onClick={() => navigate("/student")}>Analyze My Resume <span>→</span></button></div>
      </section>

      <section className="role-section recruiter-pro">
        <div className="role-content"><div className="role-badge recruiter-badge">🎯 Recruiter</div><h2>Screen Dozens of Candidates Instantly</h2><p>From a stack of resumes to a ranked shortlist in one click.</p><ul className="role-benefits"><li>Bulk upload resumes</li><li>Automatic ranking by fit</li><li>AI insights per candidate</li><li>One-click outreach</li></ul><button className="role-cta" onClick={() => navigate("/recruiter")}>Start Screening <span>→</span></button></div>
        <div className="role-visual recruiter-visual-new"><div className="ranking-list"><div className="rank-item rank-1"><span className="rank-badge">1</span><div className="rank-info"><div>Sarah</div><div className="rank-score">94%</div></div></div><div className="rank-item rank-2"><span className="rank-badge">2</span><div className="rank-info"><div>Alex</div><div className="rank-score">88%</div></div></div><div className="rank-item rank-3"><span className="rank-badge">3</span><div className="rank-info"><div>Jordan</div><div className="rank-score">82%</div></div></div></div></div>
      </section>

      <section className="final-cta-pro"><div className="cta-content"><p className="section-kicker">START WITH A STRONGER FIRST IMPRESSION</p><h2>Ready to Transform Your Hiring?</h2><div className="final-buttons"><button className="final-btn student-btn" onClick={() => navigate("/student")}><span className="btn-emoji">📝</span><strong>Student</strong><span>Optimize my resume</span></button><button className="final-btn recruiter-btn" onClick={() => navigate("/recruiter")}><span className="btn-emoji">👔</span><strong>Recruiter</strong><span>Screen candidates</span></button></div><p className="cta-tagline">“Great careers start with great first impressions.”</p></div></section>

      <section className="trust-section"><div className="trust-content"><div className="trust-badge"><span className="trust-icon">✓</span><div className="trust-text"><strong>10,000+</strong><p>Resumes Optimized</p></div></div><div className="trust-divider" /><div className="trust-badge"><span className="trust-icon">✓</span><div className="trust-text"><strong>500+</strong><p>Companies Using</p></div></div><div className="trust-divider" /><div className="trust-badge"><span className="trust-icon">✓</span><div className="trust-text"><strong>95%</strong><p>User Satisfaction</p></div></div></div></section>
    </div>
  );
}
