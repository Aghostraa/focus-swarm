import type { InstalledSkill } from '../skills/types.js';

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Register a skill as an MCP tool on the local AXL node's router_port.
export async function registerSkillAsMcpTool(axlMcpUrl: string, skill: InstalledSkill): Promise<void> {
  const tool: McpToolDef = {
    name: skill.name,
    description: skill.description,
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Skill input / query' },
      },
      required: ['input'],
    },
  };

  const res = await fetch(`${axlMcpUrl}/tools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/register',
      params: { tool },
    }),
  });

  if (!res.ok) {
    throw new Error(`MCP register ${skill.name} → ${res.status}: ${await res.text()}`);
  }
}

// List MCP tools on a remote peer (proxied via local AXL /send+/recv).
export async function listRemoteMcpTools(
  axlApiUrl: string,
  targetPeerId: string,
): Promise<McpToolDef[]> {
  const { AxlClient } = await import('@cortex/core');
  const axl = new AxlClient(axlApiUrl);

  const requestId = `list-${Date.now()}`;
  await axl.send(targetPeerId, {
    type: 'mcp-proxy',
    requestId,
    method: 'tools/list',
    params: {},
  });

  // Poll /recv for the reply (up to 5s).
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const m = await axl.recv();
    if (!m) {
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    try {
      const parsed = JSON.parse(m.body);
      if (parsed.requestId === requestId && Array.isArray(parsed.tools)) {
        return parsed.tools as McpToolDef[];
      }
    } catch {
      // skip unparseable
    }
  }
  return [];
}

// Invoke a named MCP tool on a remote peer via AXL A2A.
export async function callRemoteMcpTool(
  axlApiUrl: string,
  targetPeerId: string,
  toolName: string,
  params: unknown,
): Promise<{ result: unknown; verified: boolean }> {
  const { AxlClient } = await import('@cortex/core');
  const axl = new AxlClient(axlApiUrl);

  const requestId = `call-${Date.now()}`;
  await axl.send(targetPeerId, {
    type: 'mcp-proxy',
    requestId,
    method: 'tools/call',
    params: { name: toolName, arguments: params },
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const m = await axl.recv();
    if (!m) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
    try {
      const parsed = JSON.parse(m.body);
      if (parsed.requestId === requestId) {
        return { result: parsed.result, verified: parsed.verified ?? false };
      }
    } catch {
      // skip
    }
  }
  throw new Error(`callRemoteMcpTool timeout for ${toolName}`);
}
