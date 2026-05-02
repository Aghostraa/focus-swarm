import type { AnalysisResult, CheckResult, JobInput, LetterDraft } from "../types.js";

const banned = [
  "i am excited to apply",
  "perfect fit",
  "passionate about innovation",
  "dynamic team",
  "leveraging cutting-edge",
  "dear hiring manager",
  "to whom it may concern"
];

const overclaimPatterns = [
  /expert in payments/i,
  /years of product management/i,
  /managed large teams/i,
  /deep youtrack experience/i
];

export function checkDraft(job: JobInput, draft: LetterDraft, analysis: AnalysisResult): CheckResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const allText = `${draft.subject}\n${draft.coverLetter}\n${draft.email}`;
  const lower = allText.toLowerCase();

  for (const phrase of banned) {
    if (lower.includes(phrase)) {
      issues.push(`Remove generic phrase: "${phrase}".`);
    }
  }

  for (const pattern of overclaimPatterns) {
    if (pattern.test(allText)) {
      issues.push(`Potential overclaim detected: ${pattern.source}.`);
    }
  }

  if (!lower.includes(job.company.toLowerCase())) {
    issues.push("Company name is missing from the draft.");
  }

  if (!lower.includes(job.role.toLowerCase().split(/\s+/)[0])) {
    suggestions.push("Mention the role more explicitly in the opening or email.");
  }

  if (draft.coverLetter.length < 1200) {
    suggestions.push("Cover letter may be too thin; add one more concrete proof point.");
  }

  if (draft.coverLetter.length > 3200) {
    issues.push("Cover letter is too long; trim to a tighter one-page draft.");
  }

  if (analysis.gaps.length > 0 && !mentionsAny(draft.coverLetter, analysis.gaps)) {
    suggestions.push("Consider naming the main gap briefly instead of letting the reviewer infer it.");
  }

  if (!/\bBest,\nAhoura\b/.test(draft.coverLetter)) {
    suggestions.push("Use the preferred simple signoff: Best, Ahoura.");
  }

  const score = Math.max(0, 100 - issues.length * 18 - suggestions.length * 6);

  return {
    passed: issues.length === 0,
    score,
    issues,
    suggestions
  };
}

function mentionsAny(text: string, phrases: string[]): boolean {
  const lower = text.toLowerCase();
  return phrases.some(phrase => {
    const token = phrase.toLowerCase().split(/\W+/).find(part => part.length > 6);
    return token ? lower.includes(token) : false;
  });
}
