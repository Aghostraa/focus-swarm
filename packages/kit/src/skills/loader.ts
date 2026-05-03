import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillPack } from './types.js';

interface Frontmatter {
  name?: string;
  description?: string;
  version?: string;
  triggers?: string[];
}

function parseFrontmatter(text: string): { meta: Frontmatter; body: string } {
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: text };
  const raw = text.slice(3, end).trim();
  const body = text.slice(end + 4).trim();
  const meta: Frontmatter = {};
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key === 'triggers') {
      meta.triggers = value.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (key === 'name' || key === 'description' || key === 'version') {
      meta[key] = value;
    }
  }
  return { meta, body };
}

function inferTriggers(name: string, description: string, body: string): string[] {
  const out = new Set<string>();
  for (const s of [name, description]) {
    s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3).forEach((w) => out.add(w));
  }
  const useWhen = body.match(/Use when ([\s\S]+?)(?:\n---|\n#|\n##|$)/i)?.[1] ?? '';
  useWhen.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3).forEach((w) => out.add(w));
  return [...out].slice(0, 24);
}

export function loadSkillPack(skillMdPath: string): SkillPack {
  const text = fs.readFileSync(skillMdPath, 'utf8');
  const { meta, body } = parseFrontmatter(text);
  const name = meta.name ?? path.basename(path.dirname(skillMdPath));
  const description = meta.description ?? body.split('\n').find((l) => l.trim().length > 0)?.trim() ?? name;
  const triggers = meta.triggers?.length ? meta.triggers : inferTriggers(name, description, body);
  return {
    name,
    version: meta.version ?? '0.1.0',
    description,
    triggers,
    instructions: body,
    sourcePath: skillMdPath,
  };
}

export function loadSkillDirectory(dir: string): SkillPack[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name, 'SKILL.md'))
    .filter((p) => fs.existsSync(p))
    .map(loadSkillPack);
}
