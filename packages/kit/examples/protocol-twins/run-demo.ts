import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  agentEnsTextRecords,
  buildSkillPrompt,
  consolidateMemory,
  createAgentBrain,
  createProofBundle,
  installSkillLocally,
  loadSkillDirectory,
  memoryStreamId,
  registerAgentEns,
  selectSkillsForTask,
  uploadProofBundle,
  uploadSkillManifest,
  uploadSkillPack,
  verifiedReason,
  type PersistentAgentBrain,
  type SkillPack,
} from '../../src/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRepoRoot(start: string): string {
  let cur = start;
  while (cur !== path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, 'pnpm-workspace.yaml'))) return cur;
    cur = path.dirname(cur);
  }
  return process.cwd();
}
const REPO_ROOT = findRepoRoot(HERE);
const SKILLS_DIR = path.join(REPO_ROOT, '.claude/skills');
const AGENTS_DIR = path.join(REPO_ROOT, 'packages/kit/examples/protocol-twins/agents');
const OUT_DIR = path.join(REPO_ROOT, 'infra/deploy/protocol-twins');

interface TwinConfig {
  name: string;
  ensName: string;
  protocol: string;
  mission: string;
  boundaries: string[];
  skills: string[];
}

const DEFAULT_TASK = 'Create an ENS-discoverable persistent agent that stores its brain on 0G and communicates over AXL.';

function loadTwinConfigs(): TwinConfig[] {
  return fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8')) as TwinConfig);
}

function skillMap(skills: SkillPack[]): Map<string, SkillPack> {
  return new Map(skills.map((s) => [s.name, s]));
}

async function buildTwin(config: TwinConfig, skillsByName: Map<string, SkillPack>, opts: { uploadSkills: boolean }): Promise<PersistentAgentBrain> {
  const installed = [];
  for (const name of config.skills) {
    const skill = skillsByName.get(name);
    if (!skill) throw new Error(`Skill ${name} not found for ${config.name}`);
    let rootHash: string | undefined;
    if (opts.uploadSkills) {
      const uploaded = await uploadSkillPack(skill);
      rootHash = uploaded.rootHash;
    }
    installed.push(installSkillLocally(skill, rootHash));
  }

  const brain = createAgentBrain({
    name: config.name,
    ensName: config.ensName,
    protocol: config.protocol,
    mission: config.mission,
    boundaries: config.boundaries,
    skills: installed,
    integrations: {
      episodicStreamId: memoryStreamId(config.name, 'episodic'),
    } as any,
  });

  if (opts.uploadSkills) {
    const manifest = {
      agentName: config.name,
      skills: installed,
      generatedAt: Date.now(),
    };
    const uploaded = await uploadSkillManifest(manifest);
    brain.integrations.skillManifestRootHash = uploaded.rootHash;
  }

  return brain;
}

async function runTwin(brain: PersistentAgentBrain, skillsByName: Map<string, SkillPack>, task: string, verified: boolean): Promise<{ brain: PersistentAgentBrain; reply: string; verifiedCount: number }> {
  const concreteSkills = brain.skills.map((s) => skillsByName.get(s.name)).filter(Boolean) as SkillPack[];
  const selected = selectSkillsForTask(concreteSkills, `${task} ${brain.identity.protocol ?? ''}`, 2);
  const prompt = buildSkillPrompt(selected, task);

  let reply: string;
  let verifiedCount = 0;
  if (verified) {
    const result = await verifiedReason([
      { role: 'system', content: `You are ${brain.identity.name}, the ${brain.identity.protocol} protocol twin.\nMission: ${brain.identity.mission}\nBoundaries:\n${brain.identity.boundaries.map((b) => `- ${b}`).join('\n')}` },
      { role: 'user', content: `${prompt}\n\nReturn your protocol-specific implementation plan in 5 concise bullets.` },
    ]);
    reply = result.text;
    verifiedCount = 1;
  } else {
    const skillNames = selected.map((s) => s.skill.name).join(', ') || brain.skills.map((s) => s.name).join(', ');
    reply = `${brain.identity.name} would apply skills [${skillNames}] to handle the ${brain.identity.protocol} part of: ${task}`;
  }

  const updated = await consolidateMemory(brain, [{
    id: `demo-${brain.identity.name}-${Date.now()}`,
    task,
    protocol: brain.identity.protocol,
    fix: `Selected skills: ${selected.map((s) => s.skill.name).join(', ') || 'none'}`,
    outcome: 'worked',
    timestamp: Date.now(),
  }], { verified: false });

  return { brain: updated, reply, verifiedCount };
}

async function main() {
  const task = process.env.PROTOCOL_TWINS_TASK ?? DEFAULT_TASK;
  const upload = process.env.PROTOCOL_TWINS_UPLOAD === '1';
  const registerEns = process.env.PROTOCOL_TWINS_REGISTER_ENS === '1';
  const verified = process.env.PROTOCOL_TWINS_VERIFIED === '1';

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const skills = loadSkillDirectory(SKILLS_DIR);
  const skillsByName = skillMap(skills);
  const twins = await Promise.all(loadTwinConfigs().map((c) => buildTwin(c, skillsByName, { uploadSkills: upload })));

  const results = [];
  for (const twin of twins) {
    const result = await runTwin(twin, skillsByName, task, verified);
    results.push(result);
  }

  const verifiedReasoningByAgent = Object.fromEntries(results.map((r) => [r.brain.identity.name, r.verifiedCount]));
  const proof = createProofBundle({
    sessionId: `protocol-twins-${Date.now().toString(36)}`,
    task,
    agents: results.map((r) => r.brain),
    artifacts: {
      mode: verified ? 'verified-0g-compute' : 'dry-run',
      skillsSource: SKILLS_DIR,
    },
    verifiedReasoningByAgent,
  });

  let proofRootHash: string | undefined;
  if (upload) {
    const uploaded = await uploadProofBundle(proof);
    proofRootHash = uploaded.rootHash;
    for (const r of results) r.brain.integrations.proofRootHash = proofRootHash;
  }

  if (registerEns) {
    for (const r of results) {
      await registerAgentEns({
        ensName: r.brain.identity.ensName!,
        texts: agentEnsTextRecords({
          protocol: r.brain.identity.protocol,
          skillManifestRootHash: r.brain.integrations.skillManifestRootHash,
          proofRootHash,
          episodicStreamId: memoryStreamId(r.brain.identity.name, 'episodic'),
        }),
      });
    }
  }

  const out = {
    task,
    upload,
    registerEns,
    verified,
    replies: results.map((r) => ({ agent: r.brain.identity.name, protocol: r.brain.identity.protocol, reply: r.reply })),
    proof,
    proofRootHash: proofRootHash ?? null,
  };

  const outPath = path.join(OUT_DIR, 'latest-demo.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ outPath, proofRootHash: proofRootHash ?? null, agents: proof.agents.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
