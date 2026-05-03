import type { AnalysisResult, JobInput, LetterDraft, ProfileContext, ResearchResult } from "../types.js";
import { summarizeProfile } from "../profile.js";
import { verifiedReason } from "@cortex/kit";

export async function writeDraft(
  job: JobInput,
  context: ProfileContext,
  analysis: AnalysisResult,
  research: ResearchResult,
  candidateName: string = "[Your Name]"
): Promise<LetterDraft> {
  // All inference via 0G Compute (TeeML), no Anthropic/Claude fallback
  const result = await verifiedReason([
    {
      role: "system",
      content: "You are a job search writer. Write tailored cover letters and emails using the candidate's profile, voice, and the job details. Return valid JSON with keys: subject, coverLetter, email. Do not invent credentials."
    },
    {
      role: "user",
      content: [
        "Write a tailored cover letter and email for this application.",
        "",
        "Candidate Profile:",
        summarizeProfile(context),
        "",
        `Job: ${job.company} - ${job.role}`,
        `Description: ${job.description}`,
        "",
        `Role Analysis: ${JSON.stringify(analysis)}`,
        `Company Research: ${JSON.stringify(research)}`,
        "",
        "Return JSON with: {subject, coverLetter, email}"
      ].join("\n")
    }
  ]);

  try {
    const cleaned = result.text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as LetterDraft;
    return parsed;
  } catch {
    // Fallback if inference fails
    return writeFallbackDraft(job, analysis, research, candidateName);
  }
}

function writeFallbackDraft(job: JobInput, analysis: AnalysisResult, research: ResearchResult, candidateName: string = "[Your Name]"): LetterDraft {
  const proof = analysis.proofPoints[0] ?? "my mix of product judgment, automation, and founder-style execution";
  const signal = research.signals[0] ?? "the practical shape of the work";
  const gap = analysis.gaps[0];

  const coverLetter = [
    `Hi ${job.company} team,`,
    "",
    `I am applying for the ${job.role} role because the work seems close to the kind of problems I have been choosing deliberately: concrete user or business friction, enough technical depth to matter, and room for someone to turn ambiguity into shipped improvements.`,
    "",
    `The strongest reason I think there is a fit is ${proof}. I am not trying to present myself as a traditional ladder-climbing candidate. My useful edge is that I can move between product framing, technical implementation, and direct communication without needing those to be separate workstreams.`,
    "",
    `What stood out in this role is ${signal}. That is the sort of environment where I can be useful quickly: map the system, find the leverage point, write clearly about tradeoffs, and build or coordinate the first version instead of waiting for perfect process.`,
    "",
    gap ? `I should also be direct about one gap: ${gap}. I would rather name that clearly than bury it. The counterweight is that my recent work has forced me to learn unfamiliar domains quickly and make the learning visible through shipped artifacts.` : "I would bring a practical bias toward evidence: short discovery loops, visible artifacts, and a preference for specific user or operational signals over abstract planning.",
    "",
    `I would be glad to talk about where ${job.company} most needs leverage in this role and whether my background fits that need.`,
    "",
    "Best,",
    candidateName
  ].join("\n");

  const email = [
    `Hi ${job.company} team,`,
    "",
    `I just applied for the ${job.role} role and wanted to share a short note directly.`,
    "",
    `The role caught my attention because ${analysis.angle.toLowerCase()} I have attached a tailored letter with the concrete reasons I think there may be a fit.`,
    "",
    "Best,",
    candidateName
  ].join("\n");

  return {
    subject: `Application for ${job.role} at ${job.company}`,
    coverLetter,
    email
  };
}
