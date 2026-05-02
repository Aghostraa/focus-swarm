import type { PersistentAgentBrain } from '../agent/brain.js';
import type { FixPattern, IntegrationEvent, KnowledgeNote } from './types.js';

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function localConsolidate(events: IntegrationEvent[]): { semantic: KnowledgeNote[]; procedural: FixPattern[] } {
  const semantic: KnowledgeNote[] = [];
  const procedural: FixPattern[] = [];
  for (const event of events) {
    if (event.fix && event.error) {
      procedural.push({
        id: id('fix'),
        problem: event.error,
        fix: event.fix,
        protocol: event.protocol,
        evidence: [event.task, event.command ?? ''].filter(Boolean),
        successCount: event.outcome === 'worked' ? 1 : 0,
        failureCount: event.outcome === 'failed' ? 1 : 0,
        updatedAt: Date.now(),
      });
    } else if (event.outcome === 'worked') {
      semantic.push({
        id: id('note'),
        text: `${event.protocol ? `${event.protocol}: ` : ''}${event.task} worked${event.command ? ` using ${event.command}` : ''}.`,
        source: event.id,
        confidence: 0.7,
        updatedAt: Date.now(),
      });
    }
  }
  return { semantic, procedural };
}

export async function consolidateMemory(brain: PersistentAgentBrain, events: IntegrationEvent[], opts: { verified?: boolean } = {}): Promise<PersistentAgentBrain> {
  if (!events.length) return brain;

  let semantic: KnowledgeNote[] = [];
  let procedural: FixPattern[] = [];

  if (opts.verified) {
    const { chat } = await import('@cortex/core');
    const prompt = [
      `Agent mission: ${brain.identity.mission}`,
      `Convert integration events into durable memory. Output strict JSON:`,
      `{ "semantic": [{"text": string, "confidence": 0-1}], "procedural": [{"problem": string, "fix": string, "protocol": string}] }`,
      `Events:`,
      JSON.stringify(events.slice(-20), null, 2),
    ].join('\n');
    const result = await chat([
      { role: 'system', content: 'You consolidate agent integration memory. JSON only.' },
      { role: 'user', content: prompt },
    ]);
    if (result.verified) {
      const parsed = extractJson(result.text);
      semantic = (parsed?.semantic ?? []).map((n: any) => ({
        id: id('note'),
        text: String(n.text ?? ''),
        confidence: Number(n.confidence ?? 0.6),
        updatedAt: Date.now(),
      })).filter((n: KnowledgeNote) => n.text);
      procedural = (parsed?.procedural ?? []).map((f: any) => ({
        id: id('fix'),
        problem: String(f.problem ?? ''),
        fix: String(f.fix ?? ''),
        protocol: f.protocol ? String(f.protocol) : undefined,
        evidence: [],
        successCount: 1,
        failureCount: 0,
        updatedAt: Date.now(),
      })).filter((f: FixPattern) => f.problem && f.fix);
    }
  }

  if (!semantic.length && !procedural.length) {
    ({ semantic, procedural } = localConsolidate(events));
  }

  return {
    ...brain,
    memory: {
      ...brain.memory,
      semantic: [...brain.memory.semantic, ...semantic].slice(-50),
      procedural: [...brain.memory.procedural, ...procedural].slice(-50),
      recentEpisodes: [...brain.memory.recentEpisodes, ...events].slice(-20),
    },
    updatedAt: Date.now(),
  };
}

function extractJson(s: string): any {
  const fenced = s.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fenced ? fenced[1] : s;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}
