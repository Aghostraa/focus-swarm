import { analyzeJob } from "./agents/analyzer.js";
import { checkDraft } from "./agents/checker.js";
import { saveApplication } from "./agents/output.js";
import { researchJob } from "./agents/researcher.js";
import { writeDraft } from "./agents/writer.js";
import { loadProfileContext } from "./profile.js";
import type { JobInput, PipelineOptions, PipelineResult } from "./types.js";

export async function runApplicationPipeline(
  job: JobInput,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  validateJob(job);

  const profile = await loadProfileContext(options.rootDir);
  const analysis = analyzeJob(job, profile);
  const research = await researchJob(job);
  const draft = await writeDraft(job, profile, analysis, research);
  const check = checkDraft(job, draft, analysis);
  const saved = await saveApplication(job, draft, analysis, research, check, options);

  return {
    application: {
      id: saved.id,
      company: saved.company,
      role: saved.role,
      status: saved.status,
      appliedAt: saved.appliedAt,
      salaryExpectation: saved.salaryExpectation,
      fitScore: saved.fitScore,
      notes: saved.notes,
      files: saved.files
    },
    analysis,
    research,
    draft,
    check,
    files: {
      coverLetter: saved.coverLetterPath,
      emailDraft: saved.emailPath,
      report: saved.reportPath
    }
  };
}

function validateJob(job: JobInput): void {
  const missing = [
    ["company", job.company],
    ["role", job.role],
    ["description", job.description]
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(`Missing required job fields: ${missing.map(([name]) => name).join(", ")}`);
  }
}
