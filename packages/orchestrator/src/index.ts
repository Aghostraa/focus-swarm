// Orchestrator — full session lifecycle.
// Mints N personas, boots AXL cohort, runs persona + moderator processes,
// runs synthesizer, returns artifacts. Designed to be called from the Next UI
// or from a CLI.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generatePersona, mintPersona, type MintedPersona, type PersonaSpec } from '@focus-swarm/smith';
import { runFromFile, type Report } from '@focus-swarm/synthesizer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const SPAWN_SCRIPT = path.join(REPO_ROOT, 'infra/axl/spawn.sh');
const PEERS_FILE = path.join(REPO_ROOT, 'infra/axl/peers.local.json');
const REPORTS_DIR = path.join(REPO_ROOT, 'infra/deploy/reports');
const PIDS_FILE = path.join(REPO_ROOT, 'infra/axl/orchestrator.pids.local');

export interface ReuseSpec {
  rootHash: string;
  keyPath: string;
  ensName: string;
  tokenId: number;
  archetype?: string;
}

export interface ModeratorConfig {
  researchGoals?: string[];
  style?: 'breadth' | 'deep-dive' | 'conflict-seeking';
}

export interface SessionInput {
  targetMarket: string;
  productBrief: string;
  archetypes: string[];          // slugs for new personas to mint
  reusePersonas?: ReuseSpec[];   // existing personas to pull in without minting
  cohortId: number;
  totalTurns?: number;
  turnIntervalMs?: number;
  moderatorConfig?: ModeratorConfig;
}

export interface SessionArtifacts {
  sessionId: string;
  cohortId: number;
  personas: MintedPersona[];
  reusedPersonas: ReuseSpec[];
  transcriptPath: string;
  reportPath: string;
  reportRootHash: string | null;
  report: Report;
}

interface PeerEntry { tokenId: string; role: string; peerId: string; apiPort: number; }

function sh(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts?.cwd ?? REPO_ROOT, env: { ...process.env, ...(opts?.env ?? {}) } });
    let out = ''; let err = '';
    p.stdout.on('data', (c) => { out += c.toString(); });
    p.stderr.on('data', (c) => { err += c.toString(); });
    p.on('close', (code) => resolve({ code: code ?? 0, out, err }));
  });
}

function spawnDetached(cmd: string, args: string[], env: Record<string, string>, logFile: string): ChildProcess {
  const fd = fs.openSync(logFile, 'a');
  const p = spawn(cmd, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', fd, fd],
    detached: false,
  });
  return p;
}

function loadPeers(): PeerEntry[] {
  return JSON.parse(fs.readFileSync(PEERS_FILE, 'utf8'));
}

async function bootCohort(n: number): Promise<PeerEntry[]> {
  const r = await sh('bash', [SPAWN_SCRIPT, String(n)]);
  if (r.code !== 0) throw new Error(`spawn.sh failed: ${r.err || r.out}`);
  return loadPeers();
}

function killCohort(): void {
  try {
    const logsDir = path.join(REPO_ROOT, 'infra/axl/logs');
    const pidFiles = fs.readdirSync(logsDir).filter((f) => f.endsWith('.pid'));
    for (const f of pidFiles) {
      const pid = Number(fs.readFileSync(path.join(logsDir, f), 'utf8').trim());
      try { process.kill(pid); } catch {}
      try { fs.unlinkSync(path.join(logsDir, f)); } catch {}
    }
  } catch {}
}

function killOrchestratedChildren(children: ChildProcess[]): void {
  for (const c of children) {
    try { if (c.pid) process.kill(c.pid); } catch {}
  }
}

export async function runSession(input: SessionInput): Promise<SessionArtifacts> {
  const sessionId = `s-${input.cohortId}-${Date.now().toString(36)}`;
  const reused = input.reusePersonas ?? [];
  const totalPersonas = input.archetypes.length + reused.length;
  if (totalPersonas < 2) throw new Error('need at least 2 personas total (new + reused)');

  // 1. Mint new personas
  console.log(`[orch] minting ${input.archetypes.length} new personas, reusing ${reused.length}`);
  const minted: MintedPersona[] = [];
  for (const archetype of input.archetypes) {
    const spec: PersonaSpec = await generatePersona(input.targetMarket, archetype, input.cohortId);
    const m = await mintPersona(spec);
    minted.push(m);
    console.log(`[orch] minted ${m.ensName} tokenId=${m.tokenId}`);
  }

  // Combine new + reused into unified list for AXL slot assignment
  const allPersonas: Array<{ tokenId: number; rootHash: string; keyPath: string; ensName: string; isReuse: boolean }> = [
    ...minted.map((m) => ({ tokenId: m.tokenId, rootHash: m.rootHash, keyPath: path.join(REPO_ROOT, 'infra/axl/keys', `persona-${m.tokenId}.aes`), ensName: m.ensName, isReuse: false })),
    ...reused.map((r) => ({ tokenId: r.tokenId, rootHash: r.rootHash, keyPath: r.keyPath, ensName: r.ensName, isReuse: true })),
  ];

  // 2. Boot cohort (1 moderator + totalPersonas AXL nodes)
  console.log(`[orch] booting AXL cohort`);
  const peers = await bootCohort(totalPersonas);
  if (peers.length !== totalPersonas + 1) throw new Error(`cohort ${peers.length}, expected ${totalPersonas + 1}`);

  // 3. Spawn one persona runtime per AXL node
  const personaPeers = peers.filter((p) => p.role === 'persona');
  const moderatorPeer = peers.find((p) => p.role === 'moderator')!;
  const children: ChildProcess[] = [];

  for (let i = 0; i < totalPersonas; i++) {
    const persona = allPersonas[i];
    const peer = personaPeers[i];
    const env: Record<string, string> = {
      AXL_API_URL: `http://127.0.0.1:${peer.apiPort}`,
      PEER_LIST_PATH: PEERS_FILE,
      PERSONA_TOKEN_ID: String(persona.tokenId),
      PERSONA_ROOT_HASH: persona.rootHash,
      PERSONA_KEY_PATH: persona.keyPath,
    };
    const logFile = path.join(REPO_ROOT, 'infra/axl/logs', `persona-runtime-${persona.tokenId}.log`);
    const c = spawnDetached('pnpm', ['-F', '@focus-swarm/persona', 'start'], env, logFile);
    children.push(c);
    console.log(`[orch] persona ${persona.tokenId}${persona.isReuse ? ' (reused)' : ''} -> port ${peer.apiPort} pid=${c.pid}`);
  }

  // 4. Wait briefly for persona runtimes to subscribe to /recv
  await new Promise((s) => setTimeout(s, 4000));

  // 5. Run moderator (in-process via child)
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const moderatorEnv: Record<string, string> = {
    AXL_API_URL: `http://127.0.0.1:${moderatorPeer.apiPort}`,
    PEER_LIST_PATH: PEERS_FILE,
    SESSION_ID: sessionId,
    PRODUCT_BRIEF: input.productBrief,
    TOTAL_TURNS: String(input.totalTurns ?? 12),
    TURN_INTERVAL_MS: String(input.turnIntervalMs ?? 2000),
    REPORTS_DIR,
    ...(input.moderatorConfig?.researchGoals?.length
      ? { RESEARCH_GOALS: JSON.stringify(input.moderatorConfig.researchGoals) }
      : {}),
    ...(input.moderatorConfig?.style
      ? { MODERATION_STYLE: input.moderatorConfig.style }
      : {}),
  };
  console.log(`[orch] running moderator`);
  const mod = await sh('pnpm', ['-F', '@focus-swarm/moderator', 'start'], { env: moderatorEnv });
  if (mod.code !== 0) {
    killOrchestratedChildren(children);
    killCohort();
    throw new Error(`moderator failed: ${mod.err || mod.out}`);
  }

  // 6. Cleanup persona + AXL processes
  killOrchestratedChildren(children);
  killCohort();

  // 7. Synthesize report
  const transcriptPath = path.join(REPORTS_DIR, `${sessionId}.transcript.json`);
  if (!fs.existsSync(transcriptPath)) throw new Error(`transcript missing: ${transcriptPath}`);
  console.log(`[orch] synthesising report`);
  const { report, reportPath, rootHash } = await runFromFile(transcriptPath, REPORTS_DIR);

  return {
    sessionId,
    cohortId: input.cohortId,
    personas: minted,
    reusedPersonas: reused,
    transcriptPath,
    reportPath,
    reportRootHash: rootHash,
    report,
  };
}
