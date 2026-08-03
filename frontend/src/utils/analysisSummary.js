const toText = (value) => {
  if (typeof value === "string") return polishAnalysisPoint(value.trim());
  if (!value || typeof value !== "object") return "";
  return polishAnalysisPoint(String(value.strength || value.weakness || value.improvement || value.requirement || value.text || "").trim());
};

const polishAnalysisPoint = (text) => {
  const lower = text.toLowerCase();
  if (lower.includes("the candidate highlights") && lower.includes("technical project")) {
    return text
      .replace(/^The candidate highlights/i, "Project work shows")
      .replace("technical project(s)", "technical projects")
      .replace("with production/deployment links", "with deployment proof and practical implementation detail");
  }
  if (lower.includes("relevant experience includes")) {
    return text
      .replace(/^Relevant experience includes/i, "Industry exposure is visible through")
      .replace("year(s) of total stated background across", "stated years,")
      .replace("internship(s)", "internships")
      .replace("full-time role(s)", "full-time role signals");
  }
  if (lower.includes("verified credentials include")) {
    return text
      .replace(/^Verified credentials include/i, "Academic and certification signals add credibility through")
      .replace("listed certification(s)", "listed certification");
  }
  if (lower.includes("key technologies required by the jd not explicitly found")) {
    return text.replace(/^Key technologies required by the JD not explicitly found in the resume:/i, "JD-critical skills need clearer resume proof:");
  }
  if (lower.includes("additional missing technical requirements")) {
    return text.replace(/^Additional missing technical requirements:/i, "Additional required technologies are still weak or absent:");
  }
  if (lower.includes("requires stronger resume evidence for")) {
    return text.replace(/^Requires stronger resume evidence for:/i, "Add a project, task, or measurable result connected to");
  }
  if (lower.includes("stated experience duration or seniority is below target")) {
    return "Experience depth appears below the JD target, so stronger ownership and impact details are needed.";
  }
  return text;
};

const isOldGenericPoint = (value) => {
  const text = typeof value === "string"
    ? value
    : String(value?.strength || value?.weakness || value?.improvement || value?.text || "");
  const lower = text.toLowerCase();
  return [
    "the candidate highlights",
    "relevant experience includes",
    "verified credentials include",
    "key technologies required by the jd not explicitly found",
    "additional missing technical requirements",
    "requires stronger resume evidence",
    "stated experience duration or seniority is below target",
  ].some((phrase) => lower.includes(phrase));
};

const shortList = (items, limit) =>
  (Array.isArray(items) ? items : [])
    .map(toText)
    .filter(Boolean)
    .slice(0, limit);

const generatedStrengthItems = (analysis) => {
  const skills = shortList(analysis?.matched_skills, 3);
  const projects = Number(analysis?.resume_features?.projects?.project_count || 0);
  const internships = Number(analysis?.resume_features?.experience?.internships || 0);
  const fullTime = Number(analysis?.resume_features?.experience?.full_time || 0);
  const certs = Number(analysis?.resume_features?.certifications?.certification_count || 0);

  return [
    skills.length
      ? `Strong JD alignment is visible in ${skills.join(", ")}, which gives the profile a relevant technical base.`
      : "The resume shows a usable technical foundation, but the strongest job-specific skills should be surfaced more clearly.",
    projects
      ? `Project work adds practical credibility, especially where tools, implementation choices, and outcomes are clearly described.`
      : "The profile can stand out more by adding hands-on projects tied directly to the target role.",
    internships || fullTime
      ? `Work exposure through internships or roles helps show the candidate can apply skills outside classroom tasks.`
      : "Academic work and self-driven practice can still be valuable if presented with clear scope, ownership, and results.",
    certs
      ? `Certification evidence supports learning intent and adds extra confidence around the candidate's preparation.`
      : "The resume has room to add credible learning signals such as certifications, labs, or role-relevant coursework.",
  ].slice(0, 4);
};

const generatedWeaknessItems = (analysis) => {
  const missing = shortList(analysis?.missing_skills, 5);
  const requirements = shortList(
    (analysis?.requirement_coverage || []).filter((item) => ["weak", "missing"].includes(item?.match_type)),
    2
  );

  return [
    missing.length
      ? `Important JD skills need stronger proof in the resume: ${missing.slice(0, 3).join(", ")}.`
      : "Some JD requirements are not backed by enough concrete resume evidence yet.",
    missing.length > 3
      ? `Secondary skill gaps include ${missing.slice(3, 5).join(", ")}, which may reduce shortlist confidence.`
      : "The resume should connect skills to specific tasks, tools, and outcomes instead of relying on broad claims.",
    requirements.length
      ? `Add a focused project or work bullet that directly demonstrates ${requirements[0].replace(/\.$/, "")}.`
      : "Project bullets would be stronger with metrics, user impact, deployment detail, or ownership clarity.",
    "Experience fit will improve if the resume shows role-level responsibility, production exposure, and measurable technical impact.",
  ].slice(0, 4);
};

const listText = (items, limit = 4) => {
  const values = (Array.isArray(items) ? items : [])
    .map(toText)
    .filter(Boolean)
    .slice(0, limit);
  return values.length ? values.join(", ") : "";
};

const combinedItems = (analysis, fields, fallbackField, generatedFallback) => {
  const values = fields
    .flatMap((field) => (Array.isArray(analysis?.[field]) ? analysis[field] : []))
    .map(toText)
    .filter(Boolean);
  if (values.length) return values;
  const fallbackValues = Array.isArray(analysis?.[fallbackField]) ? analysis[fallbackField] : [];
  if (!fallbackValues.length || fallbackValues.some(isOldGenericPoint)) {
    return generatedFallback(analysis);
  }
  return fallbackValues.map(toText).filter(Boolean);
};

export const getStrengthItems = (analysis) =>
  combinedItems(
    analysis,
    ["technical_strengths", "project_highlights", "industry_readiness"],
    "strengths",
    generatedStrengthItems
  );

export const getWeaknessItems = (analysis) =>
  combinedItems(
    analysis,
    ["missing_core_skills", "missing_production_experience"],
    "weaknesses",
    generatedWeaknessItems
  );

export const getImprovementItems = (analysis) =>
  combinedItems(analysis, ["resume_improvements"], "improvements");

const labelForComponent = {
  skill_match: "skill match",
  requirement_coverage: "requirement coverage",
  experience_fit: "experience fit",
  profile_signals: "profile signals",
};

const componentTotals = {
  skill_match: 35,
  requirement_coverage: 30,
  experience_fit: 20,
  profile_signals: 15,
};

function weakestComponent(scoreComponents = {}) {
  const entries = Object.entries(componentTotals)
    .map(([key, total]) => ({
      key,
      points: Number(scoreComponents[key] || 0),
      ratio: Number(scoreComponents[key] || 0) / total,
      total,
    }))
    .sort((a, b) => a.ratio - b.ratio);
  return entries[0] || null;
}

function requirementStats(requirements = []) {
  const safeRequirements = Array.isArray(requirements) ? requirements : [];
  const covered = safeRequirements.filter((item) => ["strong", "partial"].includes(item?.match_type));
  const weakOrMissing = safeRequirements.filter((item) => ["weak", "missing"].includes(item?.match_type));
  const importantGaps = weakOrMissing
    .filter((item) => Number(item?.weight || 0) >= 0.5)
    .map(toText)
    .filter(Boolean)
    .slice(0, 3);

  return {
    total: safeRequirements.length,
    covered: covered.length,
    importantGaps,
  };
}

export function buildResumeSummary(analysis, candidateName = "This candidate") {
  if (!analysis) return "No summary available.";

  const name = candidateName || analysis.name || "This candidate";
  const score = Number(analysis.score || 0);
  const verdict = analysis.verdict || "Needs Review";
  const matchedSkills = listText(analysis.matched_skills, 5);
  const missingSkills = listText(analysis.missing_skills, 5);
  const strengths = listText(getStrengthItems(analysis), 2);
  const weaknesses = getWeaknessItems(analysis)
    .map(toText)
    .filter(Boolean);
  const mainWeakness = weaknesses[0];
  const secondWeakness = weaknesses[1];
  const weakest = weakestComponent(analysis.score_components || {});
  const requirements = requirementStats(analysis.requirement_coverage || []);
  const features = analysis.resume_features || {};
  const projects = features.projects || {};
  const experience = features.experience || {};
  const certifications = features.certifications || {};

  const sentences = [
    `${name} has an ATS match score of ${score}% with a "${verdict}" verdict, so the resume is not yet proving a complete match for this job description.`,
  ];

  if (weakest) {
    sentences.push(
      `The weakest scoring area is ${labelForComponent[weakest.key]}, where the resume earned ${weakest.points}/${weakest.total}; this is the first place to investigate because it is pulling the overall score down.`
    );
  }

  if (matchedSkills) {
    sentences.push(`The strongest positive evidence is skill alignment around ${matchedSkills}.`);
  } else {
    sentences.push("The resume does not show enough direct skill overlap with the JD, which makes the candidate look less relevant even if they may have related experience.");
  }

  if (strengths) {
    sentences.push(`The useful resume evidence currently visible includes ${strengths}.`);
  }

  if (requirements.total) {
    sentences.push(
      `Requirement coverage is also a concern: the matcher found strong or partial evidence for ${requirements.covered} of ${requirements.total} JD requirement(s).`
    );
  }

  if (mainWeakness) {
    sentences.push(`The main issue in the candidate profile is that ${mainWeakness.replace(/\.$/, "")}.`);
  } else if (missingSkills) {
    sentences.push(`The main issue in the candidate profile is missing or unclear evidence for ${missingSkills}.`);
  }

  if (secondWeakness) {
    sentences.push(`A second issue is that ${secondWeakness.replace(/\.$/, "")}.`);
  }

  if (requirements.importantGaps.length) {
    sentences.push(`Important JD gaps include ${requirements.importantGaps.join(", ")}.`);
  }

  if (missingSkills) {
    sentences.push(`The resume should add clearer proof of ${missingSkills}, ideally through project bullets, work experience bullets, tools used, and measurable results.`);
  }

  sentences.push(
    `Profile signals show ${projects.project_count || 0} project-related signal(s), ${experience.years || 0} stated year(s) of experience, and ${certifications.certification_count || 0} certification signal(s), so the candidate needs stronger evidence, not just more keywords.`
  );
  sentences.push(
    "For a recruiter, this means the candidate may still be worth reviewing if the role is flexible, but the resume currently needs clearer JD-specific proof, quantified impact, deployment or ownership details, and stronger coverage of missing requirements before it should rank highly."
  );

  return sentences.join(" ");
}
