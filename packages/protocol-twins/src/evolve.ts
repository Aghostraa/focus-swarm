// Skill evolution — detect gaps from episodic log and generate updated skills.

import fs from 'node:fs';
import path from 'node:path';
import { verifiedReason } from '@cortex/kit';

export interface EvolutionResult {
  evolved: boolean;
  skillsUpdated: string[];
  newBrainHash?: string;
  reason: string;
}

/**
 * Read episodic log and identify knowledge gaps.
 * Gaps = unverified outcomes, error answers, or unanswered questions.
 */
function readEpisodic(agentName: string): { outcome: string; notes: string }[] {
  const logDir = path.resolve(process.cwd(), '.integration-log');
  const logFile = path.join(logDir, `${agentName}.jsonl`);

  if (!fs.existsSync(logFile)) return [];

  const lines = fs
    .readFileSync(logFile, 'utf-8')
    .split('\n')
    .filter((line) => line.trim());

  return lines
    .slice(-50) // Last 50 events
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((e) => e !== null);
}

/**
 * Identify gaps from episodic log entries.
 * Returns list of topics/queries that failed or couldn't be answered.
 */
function identifyGaps(events: { outcome: string; notes: string }[]): string[] {
  const gaps: string[] = [];

  for (const event of events) {
    if (event.outcome === 'unverified' || event.notes?.includes('Error:')) {
      // Extract question from notes if possible
      const qMatch = event.notes?.match(/Q: ([^|]+)/);
      if (qMatch?.[1]) {
        gaps.push(qMatch[1].trim());
      }
    }
  }

  return [...new Set(gaps)].slice(0, 5); // Deduplicate, limit to 5
}

/**
 * Evolve skills by reading episodic log, identifying gaps, and generating updates.
 * Only accepts TeeML-verified (verified=true) updates.
 */
export async function evolveSkills(
  agentName: string,
  skills: any[],
  skillDir: string,
  opts?: { focus?: string },
): Promise<EvolutionResult> {
  const events = readEpisodic(agentName);
  if (!events.length) {
    return { evolved: false, skillsUpdated: [], reason: 'no episodic log' };
  }

  const gaps = identifyGaps(events);
  if (!gaps.length) {
    return { evolved: false, skillsUpdated: [], reason: 'no gaps detected' };
  }

  console.log(`[evolve:${agentName}] detected ${gaps.length} gaps: ${gaps.join(', ')}`);

  const updatedSkills: string[] = [];

  // For each gap, generate an update
  for (const gap of gaps) {
    try {
      const skillFile = path.join(skillDir, `${skills[0]?.name || 'generic'}.md`);
      const existingContent = fs.existsSync(skillFile)
        ? fs.readFileSync(skillFile, 'utf-8')
        : '[No existing skill]';

      const prompt = [
        {
          role: 'system' as const,
          content: `You are a skill curator for ${agentName}.
Current skill content: ${existingContent.slice(0, 1000)}
Failed/unanswered query: "${gap}"
Write an updated skill section that addresses this gap. Output ONLY the updated markdown.`,
        },
        {
          role: 'user' as const,
          content: `Update the skill to handle: ${gap}`,
        },
      ];

      const result = await verifiedReason(prompt);

      // Only write if verified
      if (!result.verified) {
        console.log(`[evolve:${agentName}] skipped unverified update for gap: ${gap}`);
        continue;
      }

      // Write backup and update
      if (fs.existsSync(skillFile)) {
        fs.copyFileSync(skillFile, `${skillFile}.bak`);
      }

      // Append to existing skill or create new section
      const newContent = existingContent + '\n\n## Updated: ' + new Date().toISOString() + '\n' + result.text;
      fs.writeFileSync(skillFile, newContent, 'utf-8');

      updatedSkills.push(path.basename(skillFile));
      console.log(`[evolve:${agentName}] updated skill: ${path.basename(skillFile)}`);
    } catch (e) {
      console.warn(`[evolve:${agentName}] evolution for gap '${gap}' failed:`, (e as Error).message);
    }
  }

  return {
    evolved: updatedSkills.length > 0,
    skillsUpdated: updatedSkills,
    reason: `evolved from ${gaps.length} gaps`,
  };
}
