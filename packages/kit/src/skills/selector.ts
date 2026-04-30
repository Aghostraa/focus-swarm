import type { InstalledSkill, SkillPack } from './types.js';

export interface SelectedSkill {
  skill: SkillPack | InstalledSkill;
  score: number;
  matchedTriggers: string[];
}

export function selectSkillsForTask(skills: Array<SkillPack | InstalledSkill>, task: string, limit = 3): SelectedSkill[] {
  const words = new Set(task.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return skills
    .filter((s) => ('enabled' in s ? s.enabled : true))
    .map((skill) => {
      const matchedTriggers = skill.triggers.filter((t) => words.has(t.toLowerCase()) || task.toLowerCase().includes(t.toLowerCase()));
      const nameHit = task.toLowerCase().includes(skill.name.toLowerCase()) ? 2 : 0;
      return { skill, score: matchedTriggers.length + nameHit, matchedTriggers };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildSkillPrompt(selected: SelectedSkill[], task: string): string {
  if (!selected.length) return `Task:\n${task}`;
  const blocks = selected.map(({ skill }) => {
    const instructions = 'instructions' in skill
      ? skill.instructions
      : `Skill ${skill.name}@${skill.version}: ${skill.description}`;
    return `## Skill: ${skill.name}@${skill.version}\n${instructions}`;
  });
  return [`Task:\n${task}`, `Selected skills:\n${blocks.join('\n\n')}`].join('\n\n');
}
