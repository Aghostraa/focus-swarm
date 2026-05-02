import type { AnalysisResult, JobInput, LetterDraft, ProfileContext, ResearchResult } from "../types.js";
import { summarizeProfile } from "../profile.js";

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
};

export async function writeDraft(
  job: JobInput,
  context: ProfileContext,
  analysis: AnalysisResult,
  research: ResearchResult,
  model = "claude-3-5-sonnet-latest",
  useAnthropic = true
): Promise<LetterDraft> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && useAnthropic) {
    const generated = await writeWithAnthropic(key, model, job, context, analysis, research);
    if (generated) return generated;
  }

  return writeFallbackDraft(job, analysis, research);
}

async function writeWithAnthropic(
  key: string,
  model: string,
  job: JobInput,
  context: ProfileContext,
  analysis: AnalysisResult,
  research: ResearchResult
): Promise<LetterDraft | null> {
  const prompt = [
    "Write a tailored cover letter and short email draft for this application.",
    "Return strict JSON with keys: subject, coverLetter, email.",
    "Do not invent credentials. Use a direct, specific, unpolished-but-professional voice.",
    "",
    summarizeProfile(context),
    "",
    `Job: ${job.company} - ${job.role}`,
    job.description,
    "",
    `Analysis: ${JSON.stringify(analysis)}`,
    `Research: ${JSON.stringify(research)}`
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      temperature: 0.5,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) return null;
  const json = (await res.json()) as AnthropicResponse;
  const text = json.content?.find(part => part.type === "text")?.text;
  if (!text) return null;

  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned) as LetterDraft;
}

function writeFallbackDraft(job: JobInput, analysis: AnalysisResult, research: ResearchResult): LetterDraft {
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
    "Ahoura"
  ].join("\n");

  const email = [
    `Hi ${job.company} team,`,
    "",
    `I just applied for the ${job.role} role and wanted to share a short note directly.`,
    "",
    `The role caught my attention because ${analysis.angle.toLowerCase()} I have attached a tailored letter with the concrete reasons I think there may be a fit.`,
    "",
    "Best,",
    "Ahoura"
  ].join("\n");

  return {
    subject: `Application for ${job.role} at ${job.company}`,
    coverLetter,
    email
  };
}
