import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { packageRoot } from "./profile.js";
import { runApplicationPipeline } from "./pipeline.js";
import type { ApplicationRecord, ApplicationStatus, JobInput, Tracker } from "./types.js";

const command = process.argv[2] ?? "help";
const args = parseArgs(process.argv.slice(3));

try {
  if (command === "create") {
    const job = await readJobInput(args);
    const result = await runApplicationPipeline(job, {
      status: option(args, "status") as ApplicationStatus | undefined,
      useAnthropic: option(args, "ai") !== "false",
      model: option(args, "model"),
      outDir: option(args, "out")
    });

    console.log(`Created application for ${result.application.company} - ${result.application.role}`);
    console.log(`Fit score: ${result.analysis.fitScore}`);
    console.log(`Check: ${result.check.passed ? "passed" : "needs review"} (${result.check.score})`);
    console.log(`Cover letter: ${result.files.coverLetter}`);
    console.log(`Email: ${result.files.emailDraft}`);
    console.log(`Report: ${result.files.report}`);
  } else if (command === "list") {
    const tracker = await readTracker();
    for (const app of tracker.applications) {
      console.log(formatApplicationLine(app));
    }
  } else if (command === "tracker") {
    const tracker = await readTracker();
    console.log(JSON.stringify(tracker, null, 2));
  } else if (command === "show") {
    const tracker = await readTracker();
    const query = (option(args, "company") ?? args._[0] ?? "").toLowerCase();
    const app = tracker.applications.find(item => item.company.toLowerCase().includes(query));
    if (!app) throw new Error(`No tracker entry found for "${query}".`);
    console.log(JSON.stringify(app, null, 2));
  } else {
    printHelp();
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}

type CliArgs = { _: string[]; [key: string]: string | string[] | undefined };

async function readJobInput(values: CliArgs): Promise<JobInput> {
  const file = option(values, "file");
  if (file) {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as JobInput;
    return { ...parsed, description: parsed.description.trim() };
  }

  const inlineDescription = option(values, "description");
  const jobPath = option(values, "job");
  const description = inlineDescription
    ? inlineDescription
    : jobPath
      ? await readFile(jobPath, "utf8")
      : "";

  return {
    company: required(option(values, "company"), "company"),
    role: required(option(values, "role"), "role"),
    description: description.trim(),
    sourceUrl: option(values, "url"),
    location: option(values, "location"),
    notes: option(values, "notes"),
    salaryExpectation: option(values, "salary") ? Number(option(values, "salary")) : undefined
  };
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = { _: [] };

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }

    const [key, ...rest] = arg.slice(2).split("=");
    parsed[key] = rest.length > 0 ? rest.join("=") : "true";
  }

  return parsed;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function option(values: CliArgs, name: string): string | undefined {
  const value = values[name];
  return typeof value === "string" ? value : undefined;
}

async function readTracker(): Promise<Tracker> {
  const raw = await readFile(join(packageRoot, "applications", "tracker.json"), "utf8");
  return JSON.parse(raw) as Tracker;
}

function formatApplicationLine(app: ApplicationRecord): string {
  const date = app.appliedAt ? app.appliedAt.slice(0, 10) : "not sent";
  return `${app.status.padEnd(9)} ${String(app.fitScore).padStart(3)}  ${date}  ${app.company} - ${app.role}`;
}

function printHelp(): void {
  console.log(`Usage:
  pnpm -F @cortex/apply start create --company=CoW --role="Integration Engineer" --job=job.txt
  pnpm -F @cortex/apply list
  pnpm -F @cortex/apply tracker
  pnpm -F @cortex/apply start show --company=CoW

Create options:
  --file=job.json          JSON with company, role, description, and optional metadata
  --company=name           Company name
  --role=name              Role title
  --job=path               Plain-text job description
  --description=text       Inline job description
  --salary=number          Salary expectation
  --notes=text             Private positioning notes
  --url=https://...        Source posting URL
  --ai=false               Disable Anthropic even if ANTHROPIC_API_KEY is set`);
}
