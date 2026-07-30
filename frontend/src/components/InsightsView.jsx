import { useMemo, useState } from "react";

const clampScore = (value) => Math.max(0, Math.min(100, Number(value) || 0));

const getLevel = (score) => {
  if (score >= 80) return { label: "High", detail: "A strong application profile with clear role alignment.", tone: "high" };
  if (score >= 60) return { label: "Medium", detail: "A promising profile with a few focused refinements to make.", tone: "medium" };
  return { label: "Low", detail: "Build evidence for key requirements before applying.", tone: "low" };
};

function SkillIcon({ skill }) {
  const key = skill.toLowerCase();
  const symbol = key.includes("docker") ? "◈" : key.includes("python") ? "⌘" : key.includes("sql") ? "▤" : key.includes("machine") || key.includes("deep") ? "✦" : key.includes("cloud") || key.includes("aws") ? "☁" : "◆";
  return <span className="system-skill-icon" aria-hidden="true">{symbol}</span>;
}

function SkillRing({ skill, score, index }) {
  const safeScore = clampScore(score);
  const isMissing = safeScore === 0;
  const gradientId = `system-skill-gradient-${index}`;

  return (
    <div className={`system-skill-ring-item${isMissing ? " is-missing" : ""}`} title={isMissing ? `${skill} was not detected in your resume. Add it only if it reflects your experience.` : `${skill}: ${safeScore}% match`}>
      <div className="system-skill-ring-wrap">
        <svg viewBox="0 0 76 76" role="img" aria-label={isMissing ? `${skill}, not detected` : `${skill}, ${safeScore} percent`}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7A1F3D" />
              <stop offset="100%" stopColor="#C6A15B" />
            </linearGradient>
          </defs>
          <circle className="system-skill-ring-track" cx="38" cy="38" r="31" pathLength="100" />
          {!isMissing && <circle className="system-skill-ring-value" cx="38" cy="38" r="31" pathLength="100" stroke={`url(#${gradientId})`} strokeDasharray="100" strokeDashoffset={100 - safeScore} />}
        </svg>
        <span>{isMissing ? "?" : `${Math.round(safeScore)}%`}</span>
      </div>
      <strong>{skill}</strong>
      {isMissing && <em>Not detected</em>}
    </div>
  );
}

function ReadinessGauge({ score }) {
  // A single, shared 270° arc: center (150,150), radius 102, from 135° to 405°.
  const arcPath = "M 77.875 222.125 A 102 102 0 1 1 222.125 222.125";
  const offset = 100 - score;

  return (
    <div className="readiness-gauge" aria-label={`${score}% application readiness`}>
      <svg viewBox="0 0 300 280" role="img" aria-labelledby="readiness-gauge-title readiness-gauge-desc">
        <title id="readiness-gauge-title">Application readiness: {score}%</title>
        <desc id="readiness-gauge-desc">A 270 degree scale from low through medium to high.</desc>
        <defs>
          <linearGradient id="readiness-arc-gradient" x1="62" y1="225" x2="238" y2="46" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#C6A15B" />
            <stop offset="48%" stopColor="#E1C98E" />
            <stop offset="100%" stopColor="#F7E8C5" />
          </linearGradient>
        </defs>

        <path className="readiness-gauge__track" d={arcPath} pathLength="100" />
        <path className="readiness-gauge__progress" d={arcPath} pathLength="100" strokeDasharray="100" style={{ "--readiness-offset": offset }} />

        <g className="readiness-gauge__ticks" aria-hidden="true">
          <line x1="84.95" y1="215.05" x2="71.51" y2="228.49" />
          <line x1="150" y1="58" x2="150" y2="39" />
          <line x1="215.05" y1="215.05" x2="228.49" y2="228.49" />
          <text x="47" y="253" textAnchor="middle">LOW</text>
          <text x="150" y="24" textAnchor="middle">MEDIUM</text>
          <text x="253" y="253" textAnchor="middle">HIGH</text>
        </g>

        <text className="readiness-gauge__score" x="150" y="153" textAnchor="middle">{score}%</text>
        <text className="readiness-gauge__caption" x="150" y="177" textAnchor="middle">READY</text>
      </svg>
    </div>
  );
}

export default function InsightsView({ result }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const score = Math.round(clampScore(result?.score));
  const matched = Array.isArray(result?.matched_skills) ? result.matched_skills : [];
  const missing = Array.isArray(result?.missing_skills) ? result.missing_skills : [];
  const strengths = Array.isArray(result?.strengths) ? result.strengths : [];
  const weaknesses = Array.isArray(result?.weaknesses) ? result.weaknesses : [];
  const skillData = useMemo(
    () => Object.entries(result?.skill_scores || {})
      .map(([skill, value]) => ({ skill, score: clampScore(value) }))
      .sort((a, b) => b.score - a.score),
    [result]
  );
  const detectedSkills = skillData.filter(({ score: skillScore }) => skillScore > 0);
  const undetectedSkills = skillData.filter(({ score: skillScore }) => skillScore === 0);
  const readiness = getLevel(score);
  const career = score >= 85 ? "Senior Software Engineer" : score >= 70 ? "Software Developer" : score >= 55 ? "Junior Developer" : "Intern / Fresher Role";
  const slides = [
    { key: "readiness", icon: "◔", title: `${readiness.label} application readiness`, body: readiness.detail },
    { key: "match", icon: "✓", title: `${matched.length} matched skills found`, body: matched.length ? matched.slice(0, 5).join(" · ") : "Your strongest skills will appear here after analysis." },
    { key: "next", icon: "↗", title: "Your next best move", body: missing.length ? `Build credible evidence for ${missing.slice(0, 3).join(", ")}.` : "Your key skills align well. Refine achievements with measurable impact." },
  ];
  const currentSlide = slides[activeSlide];
  const changeSlide = (direction) => setActiveSlide((current) => (current + direction + slides.length) % slides.length);

  return (
    <section className="insights-system">
      <header className="insights-system__header">
        <div>
          <span className="system-eyebrow">TALENTLENS ANALYTICS</span>
          <h1>INSIGHTS</h1>
          <p>Understand your resume’s readiness, strengths, and most useful next improvements.</p>
        </div>
        <span className="system-scan-status"><i /> LAST SCAN READY</span>
      </header>

      <section className={`readiness-hero readiness-hero--${readiness.tone}`}>
        <div className="readiness-hero__copy">
          <span className="readiness-hero__kicker">APPLICATION READINESS</span>
          <h2>How ready is this resume for the role?</h2>
          <p>{readiness.detail}</p>
          <div className="readiness-hero__verdict"><span>{readiness.label}</span><b>{score >= 80 ? "Ready to tailor and apply" : score >= 60 ? "Refine the gaps, then apply" : "Strengthen the evidence first"}</b></div>
        </div>
        <ReadinessGauge score={score} />
      </section>

      <section className="system-stat-strip" aria-label="Resume analysis summary">
        <div><span>Matched skills</span><strong>{matched.length}</strong><small>Aligned to this role</small></div>
        <div><span>Missing skills</span><strong>{missing.length}</strong><small>Areas to strengthen</small></div>
        <div><span>Strengths</span><strong>{strengths.length}</strong><small>Signals that stand out</small></div>
        <div><span>Improvements</span><strong>{weaknesses.length}</strong><small>Items to refine</small></div>
      </section>

      <section className="system-guidance" aria-labelledby="guidance-title">
        <div className="system-guidance__intro">
          <span className="system-eyebrow">PERSONALISED GUIDANCE</span>
          <h2 id="guidance-title">What to focus on next</h2>
        </div>
        <div className="system-guidance__slide" key={currentSlide.key}>
          <span>{currentSlide.icon}</span>
          <div><h3>{currentSlide.title}</h3><p>{currentSlide.body}</p></div>
        </div>
        <div className="system-guidance__nav">
          <button type="button" onClick={() => changeSlide(-1)} aria-label="Previous insight">←</button>
          <span>{String(activeSlide + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
          <button type="button" onClick={() => changeSlide(1)} aria-label="Next insight">→</button>
        </div>
      </section>

      <section className="system-skill-card">
        <header>
          <div><span className="system-eyebrow">CAPABILITY MAP</span><h2>Skill Scores</h2></div>
          <p>Evidence detected in your resume, mapped against the role.</p>
        </header>
        {skillData.length ? (
          <div className="system-skill-layout">
            <div className="system-detected-skills">
              <span className="system-section-label">DETECTED IN RESUME</span>
              {detectedSkills.length ? detectedSkills.map(({ skill, score: skillScore }) => (
                <div className="system-skill-row" key={skill}>
                  <SkillIcon skill={skill} />
                  <span>{skill}</span>
                  <div className="system-skill-bar"><i style={{ "--skill-width": `${skillScore}%` }} /></div>
                  <b>{Math.round(skillScore)}%</b>
                </div>
              )) : <p className="system-empty">No scored skills were detected.</p>}
            </div>
            <div className="system-undetected-skills">
              <span className="system-section-label">NOT YET DETECTED</span>
              {undetectedSkills.length ? <div className="system-ring-grid">{undetectedSkills.map(({ skill, score: skillScore }, index) => <SkillRing key={skill} skill={skill} score={skillScore} index={index} />)}</div> : <p className="system-empty">All listed skills were detected.</p>}
            </div>
          </div>
        ) : <div className="system-empty system-empty--large">Skill score data will appear after your resume is analysed.</div>}
      </section>

      <section className="system-lower-layout">
        <article className="system-signals">
          <span className="system-eyebrow">RESUME SIGNALS</span>
          <h2>The evidence at a glance</h2>
          <ol>
            <li><b>{matched.length}</b><span>skills match the job description</span></li>
            <li><b>{strengths.length}</b><span>strengths support your profile</span></li>
            <li><b>{missing.length}</b><span>skills need clearer evidence</span></li>
            <li><b>{weaknesses.length}</b><span>improvement areas were found</span></li>
          </ol>
        </article>

        <article className="system-path">
          <span className="system-eyebrow">RECOMMENDED PATH</span>
          <h2>{career}</h2>
          <p>{score >= 70 ? "Your profile is positioned well. Tailor achievements to each job description and foreground measurable impact before applying." : "Build targeted projects, show measurable outcomes, and close the most important role-specific gaps before moving to more advanced roles."}</p>
          {missing.length > 0 && <div className="system-path__skills"><small>PRIORITISE</small>{missing.slice(0, 5).map((skill) => <span key={skill}>{skill}</span>)}</div>}
        </article>
      </section>
    </section>
  );
}
