import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProfileContext, Tracker, TrainingLetter } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const packageRoot = findPackageRoot(here);

function findPackageRoot(start: string): string {
  let current = start;
  for (let depth = 0; depth < 6; depth += 1) {
    // Look for package.json to identify package root
    if (existsSync(join(current, "package.json")) && existsSync(join(current, "style-guide.md"))) return current;
    current = dirname(current);
  }

  return join(start, "..");
}

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readText(path)) as T;
}

async function readTrainingLetters(rootDir: string): Promise<TrainingLetter[]> {
  const dir = join(rootDir, "training-letters");
  const files = (await readdir(dir)).filter(file => file.endsWith(".txt")).sort();
  return Promise.all(
    files.map(async file => ({
      company: parse(file).name.replace(/_/g, " "),
      text: (await readText(join(dir, file))).trim()
    }))
  );
}

export async function loadProfileContext(rootDir = packageRoot): Promise<ProfileContext> {
  const [styleGuide, profileContext, trainingLetters, tracker] = await Promise.all([
    readText(join(rootDir, "style-guide.md")),
    readText(join(rootDir, "profile-context.md")),
    readTrainingLetters(rootDir),
    readJson<Tracker>(join(rootDir, "applications", "tracker.json"))
  ]);

  return {
    styleGuide: styleGuide.trim(),
    profileContext: profileContext.trim(),
    trainingLetters,
    tracker
  };
}

export function summarizeProfile(context: ProfileContext): string {
  const sent = context.tracker.applications
    .filter(app => app.status === "sent")
    .map(app => `${app.company}: ${app.role}, fit ${app.fitScore}`)
    .join("; ");

  return [
    "Candidate positioning:",
    context.profileContext,
    "",
    "Writing rules:",
    context.styleGuide,
    "",
    `Recent sent applications: ${sent || "none yet"}`
  ].join("\n");
}
