import type { AnalysisResult, JobInput, ProfileContext } from "../types.js";

const proofKeywords = [
  ["web3", "MEV labeling agent, OLI SDK work, CoW Swap user context"],
  ["dao", "DAO-native communication and grant proposal writing"],
  ["operations", "founder-style execution across product, sales, and delivery"],
  ["strategy", "market mapping and conversion-focused product judgment"],
  ["product", "PM-style discovery, positioning, and shipping instincts"],
  ["automation", "TypeScript automation, REST APIs, and agent workflows"],
  ["ai", "practical AI agent building rather than abstract AI interest"],
  ["payments", "fintech transition narrative anchored in user trust and access"],
  ["typescript", "TypeScript implementation experience in agent tooling"],
  ["berlin", "Berlin-based availability and local market familiarity"]
];

const gapKeywords = [
  ["5+ years", "formal years-of-experience requirement may screen harshly"],
  ["enterprise", "less direct enterprise sales/process background"],
  ["payments", "fintech/payments depth should be framed as a learning edge"],
  ["youtrack", "no direct YouTrack ownership should be stated plainly"],
  ["people management", "avoid overstating formal team management"]
];

function contains(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function unique(items: string[]): string[] {
  return [...new Set(items)].filter(Boolean);
}

export function analyzeJob(job: JobInput, context: ProfileContext): AnalysisResult {
  const text = `${job.company} ${job.role} ${job.description} ${job.notes ?? ""}`;
  const proofPoints = proofKeywords
    .filter(([keyword]) => contains(text, keyword))
    .map(([, proof]) => proof);

  const gaps = gapKeywords
    .filter(([keyword]) => contains(text, keyword))
    .map(([, gap]) => gap);

  const trackerSignal = context.tracker.applications.find(app =>
    contains(app.company, job.company) || contains(job.company, app.company)
  );

  const strengths = unique([
    ...proofPoints.slice(0, 4),
    "writes in a direct, specific, founder-like voice",
    "can connect product judgment with hands-on technical execution",
    trackerSignal ? `existing tracker context: ${trackerSignal.notes}` : ""
  ]);

  const risks = unique([
    ...gaps,
    "letter must avoid sounding like a generic AI-generated application",
    "do not exaggerate formal PM, fintech, or enterprise tenure"
  ]);

  const baseScore = 58;
  const score = Math.max(
    35,
    Math.min(98, baseScore + proofPoints.length * 7 - gaps.length * 5 + (trackerSignal ? 6 : 0))
  );

  return {
    fitScore: score,
    angle: pickAngle(job, proofPoints, gaps),
    strengths,
    gaps: unique(gaps),
    proofPoints: unique(proofPoints),
    risks
  };
}

function pickAngle(job: JobInput, proofPoints: string[], gaps: string[]): string {
  if (proofPoints.some(point => point.includes("MEV")) || contains(job.company, "CoW")) {
    return "Lead with authentic protocol usage and the MEV labeling agent as concrete proof.";
  }

  if (contains(job.role, "operations") || contains(job.role, "strategy")) {
    return "Frame candidate as a builder-operator who can diagnose messy systems and ship fixes.";
  }

  if (contains(job.role, "PM") || contains(job.role, "product")) {
    return "Center the story on product judgment, crisp discovery, and technical empathy.";
  }

  if (gaps.length > 0) {
    return "Acknowledge the gap briefly, then redirect to adjacent proof and learning velocity.";
  }

  return "Use a concise founder-to-founder narrative: specific attraction, relevant proof, clear ask.";
}
