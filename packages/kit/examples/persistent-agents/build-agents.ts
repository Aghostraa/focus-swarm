import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  agentEnsTextRecords,
  createAgentBrain,
  createProofBundle,
  installSkillLocally,
  memoryStreamId,
  registerAgentEns,
  uploadProofBundle,
  uploadSkillManifest,
  uploadSkillPack,
  type PersistentAgentBrain,
  type SkillPack,
} from '../../src/index.js';
import { loadSkillDirectory } from '../../src/skills/loader.js';
import type { FixPattern, KnowledgeNote } from '../../src/memory/types.js';

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
const SKILLS_DIR = process.env.PERSISTENT_AGENT_SKILLS_DIR ?? path.join(REPO_ROOT, '.claude/skills');
const AGENTS_DIR = process.env.PERSISTENT_AGENT_CONFIG_DIR ?? path.join(REPO_ROOT, 'packages/kit/examples/persistent-agents/agents');
const OUT_DIR = process.env.PERSISTENT_AGENT_OUT_DIR ?? path.join(REPO_ROOT, 'infra/deploy/persistent-agents');

interface AgentConfig {
  name: string;
  ensName: string;
  protocol: string;
  mission: string;
  boundaries: string[];
  skills: string[];
}

function loadAgentConfigs(): AgentConfig[] {
  return fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8')) as AgentConfig);
}

function mapSkills(skills: SkillPack[]): Map<string, SkillPack> {
  return new Map(skills.map((s) => [s.name, s]));
}

function skillMemory(skill: SkillPack, agent: AgentConfig): { semantic: KnowledgeNote[]; procedural: FixPattern[] } {
  const now = Date.now();
  const semantic: KnowledgeNote = {
    id: `skill-note-${skill.name}`,
    text: `${agent.name} has installed ${skill.name}@${skill.version}: ${skill.description}`,
    source: skill.sourcePath,
    confidence: 0.9,
    updatedAt: now,
  };
  const procedural: FixPattern = {
    id: `skill-procedure-${skill.name}`,
    problem: `Builder task matches one of: ${skill.triggers.slice(0, 8).join(', ')}`,
    fix: `Apply ${skill.name}@${skill.version} instructions and record command outcomes as episodic memory.`,
    protocol: agent.protocol,
    evidence: [skill.sourcePath ?? skill.name],
    successCount: 0,
    failureCount: 0,
    updatedAt: now,
  };
  return { semantic: [semantic], procedural: [procedural] };
}

async function materializeAgent(config: AgentConfig, skillsByName: Map<string, SkillPack>, opts: { upload: boolean }): Promise<PersistentAgentBrain> {
  const installed = [];
  const semantic: KnowledgeNote[] = [];
  const procedural: FixPattern[] = [];

  for (const skillName of config.skills) {
    const skill = skillsByName.get(skillName);
    if (!skill) throw new Error(`Skill ${skillName} missing for ${config.name}`);
    const uploaded = opts.upload ? await uploadSkillPack(skill) : null;
    installed.push(installSkillLocally(skill, uploaded?.rootHash));
    const mem = skillMemory(skill, config);
    semantic.push(...mem.semantic);
    procedural.push(...mem.procedural);
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
  brain.memory.semantic = semantic;
  brain.memory.procedural = procedural;
  brain.memory.episodicStreamId = memoryStreamId(config.name, 'episodic');

  if (opts.upload) {
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

function writeAgentArtifacts(brains: PersistentAgentBrain[]): void {
  fs.mkdirSync(path.join(OUT_DIR, 'agents'), { recursive: true });
  for (const brain of brains) {
    fs.writeFileSync(
      path.join(OUT_DIR, 'agents', `${brain.identity.name}.brain.json`),
      JSON.stringify(brain, null, 2),
    );
  }
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({
    schemaVersion: 'persistent-agent-manifest/v1',
    generatedAt: Date.now(),
    agents: brains.map((brain) => ({
      name: brain.identity.name,
      ensName: brain.identity.ensName,
      protocol: brain.identity.protocol,
      skills: brain.skills.map((s) => `${s.name}@${s.version}`),
      episodicStreamId: brain.memory.episodicStreamId,
      skillManifestRootHash: brain.integrations.skillManifestRootHash ?? null,
    })),
  }, null, 2));
}

async function main() {
  const upload = process.env.PERSISTENT_AGENTS_UPLOAD === '1';
  const registerEns = process.env.PERSISTENT_AGENTS_REGISTER_ENS === '1';

  const skills = loadSkillDirectory(SKILLS_DIR);
  const skillsByName = mapSkills(skills);
  const configs = loadAgentConfigs();
  const brains = [];

  for (const config of configs) {
    brains.push(await materializeAgent(config, skillsByName, { upload }));
  }

  writeAgentArtifacts(brains);

  const proof = createProofBundle({
    sessionId: `persistent-agents-${Date.now().toString(36)}`,
    task: 'Materialize persistent agents from repo-local skills',
    agents: brains,
    artifacts: {
      skillsDir: SKILLS_DIR,
      agentsDir: AGENTS_DIR,
      mode: upload ? '0g-upload' : 'local-materialization',
    },
  });

  let proofRootHash: string | null = null;
  if (upload) {
    const uploaded = await uploadProofBundle(proof);
    proofRootHash = uploaded.rootHash;
    for (const brain of brains) brain.integrations.proofRootHash = uploaded.rootHash;
  }

  if (registerEns) {
    for (const brain of brains) {
      await registerAgentEns({
        ensName: brain.identity.ensName!,
        texts: agentEnsTextRecords({
          protocol: brain.identity.protocol,
          skillManifestRootHash: brain.integrations.skillManifestRootHash,
          proofRootHash: brain.integrations.proofRootHash,
          episodicStreamId: brain.memory.episodicStreamId,
        }),
      });
    }
  }

  const latest = {
    upload,
    registerEns,
    proofRootHash,
    proof,
    agents: brains,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), JSON.stringify(latest, null, 2));
  console.log(JSON.stringify({
    outDir: OUT_DIR,
    agents: brains.length,
    proofRootHash,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
