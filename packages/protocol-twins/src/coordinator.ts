// Multi-agent development session orchestration coordinator.

import type { AgentTarget, CapabilityRecord, DevSession } from './index.js';
import { buildDependencyGraph, topologicalSort } from './discovery.js';

/**
 * Run a complete multi-agent development session.
 * 1. Broadcast project brief to all agents
 * 2. Poll agents for peer exchange accumulation
 * 3. Build dependency graph and implementation order
 */
export async function runDevSession(
  description: string,
  agents: AgentTarget[],
  opts?: { pollIntervalMs?: number; timeoutMs?: number },
): Promise<DevSession> {
  const projectId = `proj-${Date.now().toString(36)}`;
  const pollIntervalMs = opts?.pollIntervalMs ?? 500;
  const timeoutMs = opts?.timeoutMs ?? 15_000;

  console.log(`[coordinator] session ${projectId}: broadcasting to ${agents.length} agents`);

  // Phase 1: POST /project to all agents in parallel
  const capPromises = agents.map((agent) =>
    fetch(`http://127.0.0.1:${agent.httpPort}/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, projectId }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`/project ${r.status}`);
        return (await r.json()) as CapabilityRecord;
      })
      .catch((e) => {
        console.warn(
          `[coordinator] agent ${agent.name} /project failed:`,
          (e as Error).message,
        );
        return null;
      }),
  );

  const capsRaw = await Promise.allSettled(capPromises);
  const capabilities = capsRaw
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter((c) => c !== null) as CapabilityRecord[];

  console.log(`[coordinator] got ${capabilities.length}/${agents.length} capabilities`);

  // Phase 2: Poll for peer exchanges until complete or timeout
  const startPoll = Date.now();
  const allPeerExchanges: any[] = [];

  while (Date.now() - startPoll < timeoutMs) {
    const polls = agents.map((agent) =>
      fetch(`http://127.0.0.1:${agent.httpPort}/session/${projectId}`)
        .then(async (r) => {
          if (r.status === 404) return null;
          if (!r.ok) throw new Error(`/session ${r.status}`);
          return (await r.json()) as {
            peerExchanges: any[];
            complete: boolean;
          };
        })
        .catch(() => null),
    );

    const results = await Promise.allSettled(polls);
    let totalExchanges = 0;
    let completeCount = 0;

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        allPeerExchanges.push(...result.value.peerExchanges);
        if (result.value.complete) completeCount++;
        totalExchanges += result.value.peerExchanges.length;
      }
    }

    console.log(
      `[coordinator] peer exchanges: ${totalExchanges} accumulated, ${completeCount}/${agents.length} agents complete`,
    );

    // Consider complete if majority have 2+ exchanges (each agent expects 2 peer answers)
    if (completeCount >= Math.ceil(agents.length / 2)) {
      console.log(`[coordinator] peer exchanges complete, finalizing session`);
      break;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Deduplicate peer exchanges
  const dedupKey = (ex: any) => `${ex.from}->${ex.to}`;
  const uniqueExchanges = Array.from(
    new Map(allPeerExchanges.map((ex) => [dedupKey(ex), ex])).values(),
  );

  // Phase 3: Build dependency graph and topological sort
  const graph = buildDependencyGraph(capabilities);
  const agentNames = capabilities.map((c) => c.agent);
  const implementationOrder = topologicalSort(graph, agentNames);

  const session: DevSession = {
    projectId,
    description,
    capabilities,
    peerExchanges: uniqueExchanges,
    dependencyGraph: graph,
    implementationOrder,
    generatedAt: Date.now(),
  };

  console.log(
    `[coordinator] session ready: ${implementationOrder.length} agents in order`,
  );

  return session;
}
