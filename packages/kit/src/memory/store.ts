import type { IntegrationEvent } from './types.js';

function keccakLikeLabel(label: string): string {
  // Deterministic fallback for dry-run mode. Full mode uses core's streamIdFromLabel.
  let hash = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `dry-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function memoryStreamId(agentName: string, kind: 'episodic' | 'state' | 'skills'): string {
  return keccakLikeLabel(`persistent-agent:${agentName}:${kind}`);
}

export async function appendIntegrationEvent(agentName: string, event: Omit<IntegrationEvent, 'id' | 'timestamp'>): Promise<IntegrationEvent> {
  const { logAppend } = await import('@focus-swarm/core');
  const full: IntegrationEvent = {
    ...event,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  await logAppend(memoryStreamId(agentName, 'episodic'), full);
  return full;
}

export async function readIntegrationEvents(agentName: string, fromSeq = 0): Promise<IntegrationEvent[]> {
  const { logRead } = await import('@focus-swarm/core');
  const raw = await logRead(memoryStreamId(agentName, 'episodic'), fromSeq);
  return raw
    .map((e: any) => e?.data ?? e)
    .filter((e: any) => e && typeof e.task === 'string') as IntegrationEvent[];
}

export async function setAgentState<T>(agentName: string, key: string, value: T): Promise<void> {
  const { kvSet } = await import('@focus-swarm/core');
  await kvSet(memoryStreamId(agentName, 'state'), key, value);
}

export async function getAgentState<T>(agentName: string, key: string): Promise<T | null> {
  const { kvGet } = await import('@focus-swarm/core');
  return kvGet<T>(memoryStreamId(agentName, 'state'), key);
}
