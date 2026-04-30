import type { InstalledSkill } from '../skills/types.js';
import type { IntegrationEvent, KnowledgeNote, FixPattern } from '../memory/types.js';

export interface PersistentAgentIdentity {
  name: string;
  ensName?: string;
  protocol?: string;
  mission: string;
  boundaries: string[];
}

export interface PersistentAgentIntegrations {
  axlPeerId?: string;
  inftTokenId?: number;
  inftContract?: string;
  brainRootHash?: string;
  skillManifestRootHash?: string;
  proofRootHash?: string;
}

export interface PersistentAgentBrain {
  schemaVersion: 'persistent-agent-kit/v1';
  identity: PersistentAgentIdentity;
  skills: InstalledSkill[];
  memory: {
    semantic: KnowledgeNote[];
    procedural: FixPattern[];
    recentEpisodes: IntegrationEvent[];
    episodicStreamId?: string;
  };
  integrations: PersistentAgentIntegrations;
  updatedAt: number;
}

export function createAgentBrain(input: {
  name: string;
  ensName?: string;
  protocol?: string;
  mission: string;
  boundaries?: string[];
  skills?: InstalledSkill[];
  integrations?: PersistentAgentIntegrations;
}): PersistentAgentBrain {
  return {
    schemaVersion: 'persistent-agent-kit/v1',
    identity: {
      name: input.name,
      ensName: input.ensName,
      protocol: input.protocol,
      mission: input.mission,
      boundaries: input.boundaries ?? [],
    },
    skills: input.skills ?? [],
    memory: { semantic: [], procedural: [], recentEpisodes: [] },
    integrations: input.integrations ?? {},
    updatedAt: Date.now(),
  };
}

export function summarizeAgent(brain: PersistentAgentBrain): string {
  const skillNames = brain.skills.filter((s) => s.enabled).map((s) => `${s.name}@${s.version}`).join(', ') || 'none';
  const notes = brain.memory.semantic.slice(-5).map((n) => `- ${n.text}`).join('\n') || '- none';
  const fixes = brain.memory.procedural.slice(-5).map((f) => `- ${f.problem} -> ${f.fix}`).join('\n') || '- none';
  return [
    `Agent: ${brain.identity.name}`,
    brain.identity.protocol ? `Protocol: ${brain.identity.protocol}` : '',
    brain.identity.ensName ? `ENS: ${brain.identity.ensName}` : '',
    `Mission: ${brain.identity.mission}`,
    `Skills: ${skillNames}`,
    `Recent knowledge:\n${notes}`,
    `Fix patterns:\n${fixes}`,
  ].filter(Boolean).join('\n');
}
