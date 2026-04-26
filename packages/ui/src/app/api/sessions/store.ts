import { type SessionArtifacts } from '@focus-swarm/orchestrator';

export interface SessionState {
  status: 'running' | 'done' | 'error';
  participants?: Array<{ archetype: string; role: string; ensName: string }>;
  result?: SessionArtifacts;
  error?: string;
}

export const sessionStore = new Map<string, SessionState>();
