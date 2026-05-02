// Synthesizer — read session transcript, cluster opinions, produce report.
// Can read transcript from local file or from 0G Storage by rootHash.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { chat, uploadPlain, downloadPlain, type ChatMsg } from '@cortex/core';

interface TranscriptEntry { speaker: string; text: string; ts: number; }

interface SessionData {
  sessionId: string;
  productBrief: string;
  transcript: TranscriptEntry[];
}

export interface PersonaMeta {
  ensName: string;
  role: string;
  sessionCount: number;
  domainKnowledge: Record<string, number>;
}

export interface PersonaInsight {
  ensName: string;
  role: string;
  sessionCount: number;
  topDomains: string[];
  keyContribution: string;
}

export interface Report {
  sessionId: string;
  productBrief: string;
  participantCount: number;
  utteranceCount: number;
  themes: string[];
  contradictions: string[];
  painPoints: string[];
  opportunities: string[];
  scores: { ease: number; novelty: number; trust: number; relevance: number };
  rawSummary: string;
  generatedAt: number;
  personaInsights: PersonaInsight[];
}

const SYS_PROMPT = `You are a research analyst summarising a synthetic focus group.
You receive: the product brief and the verbatim transcript.
Reply with strict JSON, no prose around it. Schema:
{
  "themes": [string, ...],            // 3-6 cross-cutting themes that emerged
  "contradictions": [string, ...],    // points where panelists openly disagreed
  "painPoints": [string, ...],        // unmet needs or frustrations surfaced
  "opportunities": [string, ...],     // concrete feature ideas the panel suggests or implies
  "scores": { "ease": 0-10, "novelty": 0-10, "trust": 0-10, "relevance": 0-10 },
  "summary": string                   // 2-4 sentence executive summary
}`;

const INSIGHT_SYS = `You are attributing focus group findings to specific participants.
Given participant profiles and the synthesised themes from the session, output a JSON array. Each element:
{ "speakerPrefix": string, "keyContribution": string }
keyContribution: one sentence describing the most valuable insight this specific participant brought.
Output the array only — no prose around it.`;

export async function synthesize(session: SessionData, personaMeta?: Record<string, PersonaMeta>): Promise<Report> {
  // Build participant profile block if metadata available
  let participantBlock = '';
  if (personaMeta && Object.keys(personaMeta).length > 0) {
    const lines = Object.entries(personaMeta).map(([peerId, m]) => {
      const topDomains = Object.entries(m.domainKnowledge)
        .filter(([, v]) => v >= 0.4).sort(([, a], [, b]) => b - a).slice(0, 2)
        .map(([k]) => k).join(', ');
      return `- ${peerId.slice(0, 8)}: ${m.role} · ${m.sessionCount} session${m.sessionCount !== 1 ? 's' : ''}${topDomains ? ` · expertise: ${topDomains}` : ''}`;
    });
    participantBlock = `\n\nPARTICIPANT PROFILES:\n${lines.join('\n')}\nWhen summarising, attribute insights to the most qualified participant.`;
  }

  const compactTranscript = session.transcript
    .map((t, i) => `[${i + 1}] ${t.speaker.slice(0, 8)}: ${t.text}`)
    .join('\n');
  const userPrompt = `PRODUCT BRIEF:\n${session.productBrief}${participantBlock}\n\nTRANSCRIPT (${session.transcript.length} utterances):\n${compactTranscript}`;
  const messages: ChatMsg[] = [
    { role: 'system', content: SYS_PROMPT },
    { role: 'user', content: userPrompt },
  ];
  const r = await chat(messages);
  if (!r.verified) throw new Error('synthesis not TeeML-verified — refusing report');
  const parsed = extractJson(r.text);
  if (!parsed) throw new Error('synth output not parseable JSON');
  const speakers = new Set(session.transcript.map((t) => t.speaker));

  // Generate per-persona insights (best-effort second verified call)
  let personaInsights: PersonaInsight[] = [];
  if (personaMeta && Object.keys(personaMeta).length > 0) {
    try {
      const insightPrompt = [
        `Themes: ${(parsed.themes ?? []).join('; ')}`,
        `Pain points: ${(parsed.painPoints ?? []).join('; ')}`,
        ``,
        `Participants:`,
        ...Object.entries(personaMeta).map(([peerId, m]) => `- ${peerId.slice(0, 8)}: ${m.role}, ${m.sessionCount} sessions`),
        ``,
        `For each participant, give one sentence on their key contribution.`,
      ].join('\n');
      const ir = await chat([
        { role: 'system', content: INSIGHT_SYS },
        { role: 'user', content: insightPrompt },
      ]);
      if (ir.verified) {
        const raw = extractJsonArray(ir.text);
        if (Array.isArray(raw)) {
          personaInsights = raw.map((item: any) => {
            const peerId = Object.keys(personaMeta).find((k) => k.startsWith(item.speakerPrefix)) ?? item.speakerPrefix;
            const meta = personaMeta[peerId] ?? { ensName: peerId, role: 'consumer', sessionCount: 0, domainKnowledge: {} };
            return {
              ensName: meta.ensName,
              role: meta.role,
              sessionCount: meta.sessionCount,
              topDomains: Object.entries(meta.domainKnowledge).filter(([, v]) => v >= 0.4).sort(([, a], [, b]) => b - a).slice(0, 3).map(([k]) => k),
              keyContribution: item.keyContribution ?? '',
            };
          });
        }
      }
    } catch (e) {
      console.warn('[synth] persona insights failed (non-fatal):', (e as Error).message);
    }
  }

  return {
    sessionId: session.sessionId,
    productBrief: session.productBrief,
    participantCount: speakers.size,
    utteranceCount: session.transcript.length,
    themes: parsed.themes ?? [],
    contradictions: parsed.contradictions ?? [],
    painPoints: parsed.painPoints ?? [],
    opportunities: parsed.opportunities ?? [],
    scores: parsed.scores ?? { ease: 0, novelty: 0, trust: 0, relevance: 0 },
    rawSummary: parsed.summary ?? '',
    generatedAt: Date.now(),
    personaInsights,
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

function extractJsonArray(s: string): any {
  const fenced = s.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fenced ? fenced[1] : s;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start < 0 || end < 0) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

export async function runFromFile(transcriptPath: string, outDir: string, personaMeta?: Record<string, PersonaMeta>): Promise<{ report: Report; reportPath: string; rootHash: string | null }> {
  const session = JSON.parse(fs.readFileSync(transcriptPath, 'utf8')) as SessionData;
  const report = await synthesize(session, personaMeta);
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, `${session.sessionId}.report.json`);
  const reportJson = JSON.stringify(report, null, 2);
  fs.writeFileSync(reportPath, reportJson);
  let rootHash: string | null = null;
  try {
    const up = await uploadPlain(Buffer.from(reportJson));
    rootHash = up.rootHash;
  } catch (e) {
    console.warn('[synth] 0G upload failed:', (e as Error).message);
  }
  return { report, reportPath, rootHash };
}

export async function runFromStorage(rootHash: string): Promise<Report> {
  const blob = await downloadPlain(rootHash);
  const session = JSON.parse(blob.toString('utf-8')) as SessionData;
  return synthesize(session);
}

if (process.argv[1] && process.argv[1].endsWith('synthesizer/src/index.ts')) {
  const transcriptPath = process.argv[2];
  const outDir = process.argv[3] ?? './infra/deploy/reports';
  if (!transcriptPath) {
    console.error('usage: tsx synthesizer/src/index.ts <transcript.json> [outDir]');
    process.exit(1);
  }
  runFromFile(transcriptPath, outDir).then((r) => {
    console.log(JSON.stringify({ reportPath: r.reportPath, rootHash: r.rootHash }, null, 2));
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
