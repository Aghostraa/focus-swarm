// Apply twin runtime — persistent MCP server + AXL listener.
// Exposes apply tools on AXL MCP router port (default 9013).
// Brain stored encrypted on 0G. No Anthropic SDK.

import 'dotenv/config';
import http from 'node:http';
import { AxlClient, pumpRecv } from '@cortex/core';
import { registerAgentEns, agentEnsTextRecords } from '@cortex/kit';
import {
  draftCoverLetter,
  getProfile,
  getPipeline,
  researchCompany,
  trackApplication,
  updateProfile,
} from './tools.js';

const AXL_API_URL = process.env.AXL_API_URL ?? 'http://127.0.0.1:9012';
const MCP_PORT = Number(process.env.APPLY_MCP_PORT ?? 9013);
const ENS_NAME = process.env.APPLY_ENS_NAME ?? 'apply.cortex.eth';

const TOOLS = [
  {
    name: 'apply.draft_cover_letter',
    description: 'Draft a cover letter using stored profile + 0G Compute. Params: company, role, jd',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string' },
        role: { type: 'string' },
        jd: { type: 'string', description: 'Job description text' },
      },
      required: ['company', 'role', 'jd'],
    },
  },
  {
    name: 'apply.research_company',
    description: 'Research a company for a job application. Params: company',
    inputSchema: {
      type: 'object',
      properties: { company: { type: 'string' } },
      required: ['company'],
    },
  },
  {
    name: 'apply.track_application',
    description: 'Upsert an application in the pipeline tracker. Params: company, role, status, notes?',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string' },
        role: { type: 'string' },
        status: { type: 'string', enum: ['lead', 'ready', 'sent', 'rejected', 'interview', 'offer'] },
        notes: { type: 'string' },
      },
      required: ['company', 'role', 'status'],
    },
  },
  {
    name: 'apply.get_pipeline',
    description: 'Return the full application pipeline from 0G KV.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'apply.update_profile',
    description: 'Update a field in the stored profile. Params: field, value',
    inputSchema: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: ['summary', 'experience', 'skills', 'targetRoles', 'culture'] },
        value: {},
      },
      required: ['field', 'value'],
    },
  },
];

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'apply.draft_cover_letter':
      return draftCoverLetter(args as any);
    case 'apply.research_company':
      return researchCompany(args as any);
    case 'apply.track_application':
      return trackApplication(args as any);
    case 'apply.get_pipeline':
      return getPipeline();
    case 'apply.update_profile':
      await updateProfile(args.field as any, args.value);
      return { ok: true };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Minimal MCP HTTP server (JSON-RPC 2.0 over HTTP).
function startMcpServer(): void {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/tools') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tools: TOOLS }));
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405); res.end(); return;
    }

    let body = '';
    await new Promise<void>((resolve, reject) => {
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve());
      req.on('error', reject);
      setTimeout(() => reject(new Error('request timeout')), 5000);
    });

    let rpc: any;
    try { rpc = JSON.parse(body); } catch {
      res.writeHead(400); res.end(); return;
    }

    const respond = (result: unknown, error?: unknown) => {
      const payload = error
        ? { jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: String(error) } }
        : { jsonrpc: '2.0', id: rpc.id, result };
      const body = JSON.stringify(payload);
      console.error('[respond] writing response, size=', body.length);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body, () => {
        console.error('[respond] response sent');
      });
    };

    try {
      if (rpc.method === 'tools/list') {
        respond({ tools: TOOLS });
      } else if (rpc.method === 'tools/call') {
        const { name, arguments: args = {} } = rpc.params ?? {};
        const result = await handleToolCall(name, args);
        respond({ content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] });
      } else {
        respond(null, `Unknown method: ${rpc.method}`);
      }
    } catch (e) {
      respond(null, (e as Error).message);
    }
  });

  server.listen(MCP_PORT, () => {
    console.error(`[apply-twin] MCP server :${MCP_PORT}`);
    console.error(`[apply-twin] Configured in .claude/settings.json`);
  });
}

async function main() {
  startMcpServer();

  // Register ENS identity.
  const axl = new AxlClient(AXL_API_URL);
  const peerId = await axl.myPubkey().catch(() => null);

  if (peerId) {
    await registerAgentEns({
      ensName: ENS_NAME,
      texts: agentEnsTextRecords({ protocol: 'apply', axlPeerId: peerId }),
    }).catch((e) => console.error('[apply-twin] ENS register failed:', e.message));
    console.error(`[apply-twin] ENS: ${ENS_NAME} peer=${peerId.slice(0, 12)}...`);
  }

  // AXL listener — handle query SwarmMsg from other twins.
  if (peerId) {
    const ac = new AbortController();
    process.on('SIGINT', () => ac.abort());
    process.on('SIGTERM', () => ac.abort());

    await pumpRecv(axl, async (msg: any, fromPeer: string) => {
      if (msg.type !== 'query') return;
      try {
        const result = await handleToolCall(msg.skill ?? 'apply.draft_cover_letter', msg.params ?? {});
        await axl.send(fromPeer, {
          type: 'answer',
          from: 'apply-twin',
          question: msg.question ?? msg.skill,
          answer: typeof result === 'string' ? result : JSON.stringify(result),
          verified: true,
          requestId: msg.requestId,
        });
      } catch (e) {
        console.warn('[apply-twin] query handler error:', (e as Error).message);
      }
    }, ac.signal);
  }
}

main().catch((e) => {
  console.error('[apply-twin] fatal', e);
  process.exit(1);
});
