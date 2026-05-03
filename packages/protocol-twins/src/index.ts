export interface TwinConfig {
  name: string;
  ensName?: string;
  protocol?: string;
  mission: string;
  boundaries?: string[];
  skills?: string[];
  axlApiUrl?: string;
  axlMcpUrl?: string;
  httpPort?: number; // HTTP /ask server port (e.g., 9013, 9023, 9033)
  slotIndex?: number; // for AXL slot assignment
  peerEnsNames?: string[]; // ENS names of peers to contact during project sessions
  capabilities?: { protocol: string; components: string[]; provides: string[] };
}

export interface AgentTarget {
  name: string;
  httpPort: number;
  axlApiUrl: string;
  ensName?: string;
}

export interface CapabilityRecord {
  agent: string;
  role: string;
  components: string[];
  needs: string[];
  provides: string[];
  verified: boolean;
}

export interface PeerExchange {
  from: string;
  to: string;
  question: string;
  answer: string;
  verified: boolean;
  skill: string;
}

export interface DevSession {
  projectId: string;
  description: string;
  capabilities: CapabilityRecord[];
  peerExchanges: PeerExchange[];
  dependencyGraph: { from: string; to: string; dep: string }[];
  implementationOrder: string[];
  generatedAt: number;
}

export { runTwin } from './runtime.js';
export { runDevSession } from './coordinator.js';
export { buildDependencyGraph, topologicalSort } from './discovery.js';
export { evolveSkills } from './evolve.js';
