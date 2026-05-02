import type { JobInput, ResearchResult } from "../types.js";

const productSignals = [
  ["cow", "intent-based trading, solver competition, MEV protection, DAO coordination"],
  ["jetbrains", "developer tools, automation, YouTrack workflows, IDE-native expectations"],
  ["sumup", "merchant tooling, payments, local business operations, fintech trust"],
  ["raisin", "deposit marketplace, open financial access, regulated financial products"],
  ["machineware", "embedded systems, RWTH Aachen network, local deep-tech credibility"],
  ["tekkr", "B2B sales tooling, challenger-style discovery, founder-led iteration"],
  ["nexamind", "AI product management, applied LLM workflows, fast validation loops"]
];

function findSignals(company: string, description: string): string[] {
  const haystack = `${company} ${description}`.toLowerCase();
  return productSignals
    .filter(([keyword]) => haystack.includes(keyword))
    .flatMap(([, signals]) => signals.split(", "));
}

export async function researchJob(job: JobInput): Promise<ResearchResult> {
  const sourceSignals = findSignals(job.company, job.description);
  const descriptionSignals = extractDescriptionSignals(job.description);

  return {
    company: job.company,
    role: job.role,
    sourceUrl: job.sourceUrl,
    signals: [...new Set([...sourceSignals, ...descriptionSignals])].slice(0, 8),
    productNotes: buildProductNotes(job, sourceSignals),
    interviewHooks: buildInterviewHooks(job)
  };
}

function extractDescriptionSignals(description: string): string[] {
  const lines = description
    .split(/\r?\n/)
    .map(line => line.trim().replace(/^[-*]\s*/, ""))
    .filter(line => line.length > 30 && line.length < 180);

  return lines.slice(0, 5);
}

function buildProductNotes(job: JobInput, signals: string[]): string[] {
  const notes = [
    `Role target: ${job.role}`,
    job.location ? `Location constraint: ${job.location}` : "",
    job.notes ?? "",
    ...signals.map(signal => `Relevant company signal: ${signal}`)
  ];

  return notes.filter(Boolean).slice(0, 8);
}

function buildInterviewHooks(job: JobInput): string[] {
  const hooks = [
    `Ask what success in ${job.role} looks like after 90 days.`,
    "Ask where current manual process or customer friction is most expensive.",
    "Offer one concrete product/ops experiment from the cover letter."
  ];

  if (job.sourceUrl) {
    hooks.push(`Reference the source URL only if it contains a fresh product or hiring detail: ${job.sourceUrl}`);
  }

  return hooks;
}
