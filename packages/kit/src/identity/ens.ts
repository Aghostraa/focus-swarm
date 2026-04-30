export interface AgentEnsRecords {
  name: string;
  addr?: string | null;
  texts: Record<string, string>;
}

export interface RegisterAgentEnsInput {
  ensName: string;
  owner?: string;
  texts: Record<string, string>;
  gatewayUrl?: string;
}

export async function registerAgentEns(input: RegisterAgentEnsInput): Promise<AgentEnsRecords> {
  const gatewayUrl = input.gatewayUrl ?? process.env.ENS_GATEWAY_URL ?? 'http://localhost:8787';
  const res = await fetch(`${gatewayUrl}/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.ensName,
      addresses: input.owner ? { 60: input.owner } : undefined,
      texts: input.texts,
    }),
  });
  if (!res.ok) throw new Error(`ens gateway ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { name: data.name, addr: data.addr, texts: data.texts ?? {} };
}

export async function resolveAgentEns(ensName: string, gatewayUrl = process.env.ENS_GATEWAY_URL ?? 'http://localhost:8787'): Promise<AgentEnsRecords> {
  const res = await fetch(`${gatewayUrl}/lookup/${encodeURIComponent(ensName)}`);
  if (!res.ok) throw new Error(`ens lookup ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { name: data.name, addr: data.addr, texts: data.texts ?? {} };
}

export function agentEnsTextRecords(input: {
  protocol?: string;
  axlPeerId?: string;
  brainRootHash?: string;
  skillManifestRootHash?: string;
  proofRootHash?: string;
  inft?: string;
  episodicStreamId?: string;
}): Record<string, string> {
  const texts: Record<string, string> = {
    'agent.framework': 'persistent-agent-kit',
  };
  if (input.protocol) texts['agent.protocol'] = input.protocol;
  if (input.axlPeerId) texts['agent.axl_peer'] = input.axlPeerId;
  if (input.brainRootHash) texts['agent.resume'] = `0g://${input.brainRootHash}`;
  if (input.skillManifestRootHash) texts['agent.skills'] = `0g://${input.skillManifestRootHash}`;
  if (input.proofRootHash) texts['agent.proof'] = `0g://${input.proofRootHash}`;
  if (input.inft) texts['agent.inft'] = input.inft;
  if (input.episodicStreamId) texts['agent.memory.episodic'] = `0gkv://${input.episodicStreamId}`;
  return texts;
}
