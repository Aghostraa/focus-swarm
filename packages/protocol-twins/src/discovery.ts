// Agent discovery and dependency graph utilities for multi-agent coordination.

import type { CapabilityRecord } from './index.js';

/**
 * Build a dependency graph from capability records.
 * For each agent's needs, find which other agent provides it.
 */
export function buildDependencyGraph(
  caps: CapabilityRecord[],
): { from: string; to: string; dep: string }[] {
  const graph: { from: string; to: string; dep: string }[] = [];

  for (const agent of caps) {
    for (const need of agent.needs) {
      const provider = caps.find((c) =>
        c.provides.some((p) =>
          p.toLowerCase().includes(need.toLowerCase()) ||
          need.toLowerCase().includes(p.toLowerCase()),
        ),
      );
      if (provider && provider.agent !== agent.agent) {
        graph.push({
          from: provider.agent,
          to: agent.agent,
          dep: need,
        });
      }
    }
  }

  return graph;
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns agents in implementation order (dependencies first).
 * Falls back to original order on cycle.
 */
export function topologicalSort(
  graph: { from: string; to: string; dep: string }[],
  agents: string[],
): string[] {
  if (!agents.length) return [];

  // Build adjacency and in-degree count
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const agent of agents) {
    adj.set(agent, []);
    inDegree.set(agent, 0);
  }

  for (const { from, to } of graph) {
    if (adj.has(from) && adj.has(to)) {
      adj.get(from)!.push(to);
      inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue = agents.filter((a) => inDegree.get(a) === 0);
  const result: string[] = [];

  while (queue.length) {
    const agent = queue.shift()!;
    result.push(agent);

    for (const neighbor of adj.get(agent) ?? []) {
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 1) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If cycle detected, fallback to original order
  return result.length === agents.length ? result : agents;
}
