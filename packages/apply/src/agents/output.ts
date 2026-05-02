import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  AnalysisResult,
  ApplicationRecord,
  CheckResult,
  JobInput,
  LetterDraft,
  PipelineOptions,
  ResearchResult,
  Tracker
} from "../types.js";
import { packageRoot } from "../profile.js";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeApplicationId(existing: ApplicationRecord[]): string {
  const next = existing.length + 1;
  return `a1b2c3d4-${String(next).padStart(4, "0")}-0000-0000-000000000${String(next).padStart(3, "0")}`;
}

export async function saveApplication(
  job: JobInput,
  draft: LetterDraft,
  analysis: AnalysisResult,
  research: ResearchResult,
  check: CheckResult,
  options: PipelineOptions = {}
): Promise<ApplicationRecord & { reportPath: string; coverLetterPath: string; emailPath: string }> {
  const rootDir = options.rootDir ?? packageRoot;
  const outRoot = options.outDir ?? join(rootDir, "applications");
  const trackerPath = join(rootDir, "applications", "tracker.json");
  const tracker = await readTracker(trackerPath);
  const slug = slugify(job.company);
  const appDir = join(outRoot, slug);

  await mkdir(appDir, { recursive: true });

  const coverLetterPath = join(appDir, "cover-letter.md");
  const emailPath = join(appDir, "email.txt");
  const reportPath = join(appDir, "report.json");

  await Promise.all([
    writeFile(coverLetterPath, draft.coverLetter, "utf8"),
    writeFile(emailPath, formatEmail(draft), "utf8"),
    writeFile(reportPath, JSON.stringify({ job, analysis, research, check }, null, 2), "utf8")
  ]);

  const existing = tracker.applications.find(app => slugify(app.company) === slug);
  const record: ApplicationRecord = {
    id: existing?.id ?? makeApplicationId(tracker.applications),
    company: job.company,
    role: job.role,
    status: options.status ?? existing?.status ?? "ready",
    appliedAt: existing?.appliedAt ?? null,
    salaryExpectation: job.salaryExpectation ?? existing?.salaryExpectation ?? null,
    fitScore: analysis.fitScore,
    notes: job.notes ?? existing?.notes ?? analysis.angle,
    files: {
      coverLetter: relativeFromRoot(rootDir, coverLetterPath),
      emailDraft: relativeFromRoot(rootDir, emailPath),
      report: relativeFromRoot(rootDir, reportPath)
    }
  };

  if (options.updateTracker ?? true) {
    await upsertTracker(trackerPath, record);
  }

  return { ...record, reportPath, coverLetterPath, emailPath };
}

export function formatEmail(draft: LetterDraft): string {
  return [`Subject: ${draft.subject}`, "", draft.email].join("\n");
}

async function readTracker(path: string): Promise<Tracker> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Tracker;
  } catch {
    await mkdir(dirname(path), { recursive: true });
    return { applications: [] };
  }
}

async function upsertTracker(path: string, record: ApplicationRecord): Promise<void> {
  const tracker = await readTracker(path);
  const index = tracker.applications.findIndex(app => app.id === record.id || slugify(app.company) === slugify(record.company));

  if (index >= 0) {
    tracker.applications[index] = record;
  } else {
    tracker.applications.push(record);
  }

  tracker.applications.sort((a, b) => a.company.localeCompare(b.company));
  await writeFile(path, `${JSON.stringify(tracker, null, 2)}\n`, "utf8");
}

function relativeFromRoot(rootDir: string, path: string): string {
  return `./${path.replace(`${rootDir}/`, "")}`;
}
