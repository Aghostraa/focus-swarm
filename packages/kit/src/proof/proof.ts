import type { PersistentAgentBrain } from '../agent/brain.js';

export interface AgentProofEntry {
  name: string;
  ensName?: string;
  protocol?: string;
  axlPeerId?: string;
  brainRootHash?: string;
  skillManifestRootHash?: string;
  proofRootHash?: string;
  verifiedReasoningCount: number;
  installedSkills: string[];
}

export interface SessionProofBundle {
  schemaVersion: 'persistent-agent-proof/v1';
  sessionId: string;
  task: string;
  agents: AgentProofEntry[];
  artifacts: Record<string, string>;
  generatedAt: number;
}

export function createProofBundle(input: {
  sessionId: string;
  task: string;
  agents: PersistentAgentBrain[];
  artifacts?: Record<string, string>;
  verifiedReasoningByAgent?: Record<string, number>;
}): SessionProofBundle {
  return {
    schemaVersion: 'persistent-agent-proof/v1',
    sessionId: input.sessionId,
    task: input.task,
    agents: input.agents.map((a) => ({
      name: a.identity.name,
      ensName: a.identity.ensName,
      protocol: a.identity.protocol,
      axlPeerId: a.integrations.axlPeerId,
      brainRootHash: a.integrations.brainRootHash,
      skillManifestRootHash: a.integrations.skillManifestRootHash,
      proofRootHash: a.integrations.proofRootHash,
      verifiedReasoningCount: input.verifiedReasoningByAgent?.[a.identity.name] ?? 0,
      installedSkills: a.skills.filter((s) => s.enabled).map((s) => `${s.name}@${s.version}`),
    })),
    artifacts: input.artifacts ?? {},
    generatedAt: Date.now(),
  };
}

export async function uploadProofBundle(bundle: SessionProofBundle): Promise<{ rootHash: string; txHash: string }> {
  const { uploadPlain } = await import('@focus-swarm/core');
  const uploaded = await uploadPlain(Buffer.from(JSON.stringify(bundle, null, 2)));
  return { rootHash: uploaded.rootHash, txHash: uploaded.txHash };
}
