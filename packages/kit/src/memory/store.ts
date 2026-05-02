import { streamIdFromLabel } from '@cortex/core';
import type { IntegrationEvent } from './types.js';

export function memoryStreamId(agentName: string, kind: 'episodic' | 'state' | 'skills'): string {
  return streamIdFromLabel(`persistent-agent:${agentName}:${kind}`);
}

export async function appendIntegrationEvent(agentName: string, event: Omit<IntegrationEvent, 'id' | 'timestamp'>): Promise<IntegrationEvent> {
  const { logAppend } = await import('@cortex/core');
  const full: IntegrationEvent = {
    ...event,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  await logAppend(memoryStreamId(agentName, 'episodic'), full);
  return full;
}

export async function readIntegrationEvents(agentName: string, fromSeq = 0): Promise<IntegrationEvent[]> {
  const { logRead } = await import('@cortex/core');
  const raw = await logRead(memoryStreamId(agentName, 'episodic'), fromSeq);
  return raw
    .map((e: any) => e?.data ?? e)
    .filter((e: any) => e && typeof e.task === 'string') as IntegrationEvent[];
}

export async function setAgentState<T>(agentName: string, key: string, value: T): Promise<void> {
  const { kvSet } = await import('@cortex/core');
  await kvSet(memoryStreamId(agentName, 'state'), key, value);
}

export async function getAgentState<T>(agentName: string, key: string): Promise<T | null> {
  const { kvGet } = await import('@cortex/core');
  return kvGet<T>(memoryStreamId(agentName, 'state'), key);
}
