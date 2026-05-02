// Protocol twin runtime — persistent process per twin.
// Boots AXL node, loads brain from 0G via ENS, pumps /recv,
// responds to query SwarmMsg with verified 0G Compute,
// persists answer to 0G episodic log, routes cross-twin queries via ENS lookup.

import 'dotenv/config';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import {
  AxlClient,
  pumpRecv,
  type SwarmMsg,
} from '@cortex/core';
import {
  resolveAgentEns,
  agentEnsTextRecords,
  registerAgentEns,
  verifiedReason,
  appendIntegrationEvent,
  registerSkillAsMcpTool,
  loadSkillDirectory,
  selectSkillsForTask,
  buildSkillPrompt,
} from '@cortex/kit';
import type { TwinConfig } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runTwin(config: TwinConfig): Promise<void> {
  try {
    console.log(`[twin:${config.name}] runTwin starting...`);
    const axlApiUrl = config.axlApiUrl ?? process.env.AXL_API_URL ?? 'http://127.0.0.1:9002';
    const axlMcpUrl = config.axlMcpUrl ?? process.env.AXL_MCP_URL;
    const skillDir = process.env.SKILL_DIR ? resolve(process.env.SKILL_DIR) : resolve(__dirname, '../../../.claude/skills');
    console.log(`[twin:${config.name}] axl=${axlApiUrl}, skillDir=${skillDir}`);
    const axl = new AxlClient(axlApiUrl);

    console.log(`[twin:${config.name}] getting peer ID...`);
    const myPeerId = await axl.myPubkey();
    console.log(`[twin:${config.name}] axl=${axlApiUrl} peer=${myPeerId.slice(0, 12)}...`);

  // Load skill packs for implicit auto-selection
  let agentSkills: any[] = [];
  try {
    const allSkills = await loadSkillDirectory(skillDir);
    agentSkills = allSkills.filter(s => config.skills?.includes(s.name));
    console.log(`[twin:${config.name}] loaded ${agentSkills.length} skills: ${agentSkills.map(s => s.name).join(', ')}`);
  } catch (e) {
    console.warn(`[twin:${config.name}] skill load failed:`, (e as Error).message);
  }

  // Register skills as MCP tools if AXL MCP router is available.
  if (axlMcpUrl && config.skills?.length) {
    for (const skill of config.skills) {
      try {
        await registerSkillAsMcpTool(axlMcpUrl, {
          name: skill,
          version: '1.0.0',
          description: skill,
          triggers: [],
          installedAt: Date.now(),
          enabled: true,
        });
      } catch (e) {
        console.warn(`[twin:${config.name}] MCP register ${skill} failed:`, (e as Error).message);
      }
    }
    console.log(`[twin:${config.name}] MCP tools registered on ${axlMcpUrl}`);
  }

  // Register/update ENS text records with current peer ID.
  if (config.ensName && process.env.ENS_GATEWAY_URL) {
    try {
      console.log(`[twin:${config.name}] ENS register attempt...`);
      await registerAgentEns({
        ensName: config.ensName,
        texts: agentEnsTextRecords({
          protocol: config.protocol,
          axlPeerId: myPeerId,
        }),
      });
      console.log(`[twin:${config.name}] ENS registered: ${config.ensName}`);
    } catch (e) {
      console.warn(`[twin:${config.name}] ENS register failed (non-fatal):`, (e as Error).message);
    }
  } else if (config.ensName) {
    console.log(`[twin:${config.name}] ENS_GATEWAY_URL not set, skipping ENS registration`);
  }

  const ac = new AbortController();
  process.on('SIGINT', () => ac.abort());
  process.on('SIGTERM', () => ac.abort());

  let interactionCount = 0;
  const EVOLUTION_INTERVAL = 10;

  const onMessage = async (msg: SwarmMsg, fromPeer: string) => {
    if (msg.type !== 'query') return;

    console.log(`[twin:${config.name}] query from=${fromPeer.slice(0, 12)} id=${msg.requestId}`);

    let answer: string;
    let verified = false;
    let selectedSkill = '';

    try {
      // Auto-select skills based on the question
      const selected = selectSkillsForTask(agentSkills, msg.question, 3);
      selectedSkill = selected.length ? selected[0].skill.name : '';
      const skillPrompt = buildSkillPrompt(selected, msg.question);

      const systemPrompt = [
        config.mission,
        config.boundaries?.length ? `\nBoundaries:\n${config.boundaries.map((b) => `- ${b}`).join('\n')}` : '',
      ].filter(Boolean).join('\n');

      const messages = [
        { role: 'system' as const, content: systemPrompt },
      ];
      if (msg.context) {
        messages.push({ role: 'user' as const, content: `Context: ${msg.context}` });
      }
      messages.push({ role: 'user' as const, content: skillPrompt });

      const result = await verifiedReason(messages);
      answer = result.text;
      verified = result.verified;
    } catch (e) {
      answer = `Error: ${(e as Error).message}`;
    }

    // Reply to the asking peer.
    const reply: SwarmMsg = {
      type: 'answer',
      from: config.name,
      question: msg.question,
      answer,
      verified,
      requestId: msg.requestId,
    };
    await axl.send(fromPeer, reply).catch((e) => {
      console.warn(`[twin:${config.name}] reply send failed:`, (e as Error).message);
    });

    // Persist to episodic log.
    interactionCount++;
    appendIntegrationEvent(config.name, {
      task: 'query',
      outcome: verified ? 'success' : 'unverified',
      integration: config.protocol ?? 'unknown',
      notes: `Q: ${msg.question.slice(0, 100)} | A: ${answer.slice(0, 200)} | skill: ${selectedSkill}`,
    }).catch(() => {});

    // Trigger evolution every N interactions
    if (interactionCount % EVOLUTION_INTERVAL === 0) {
      console.log(`[twin:${config.name}] evolution trigger (${interactionCount} interactions)`);
      // Evolution logic will be added in HTTP server section
    }
  };

  // Start HTTP /ask server (implicit message interface)
  const http = await import('node:http');
  const httpPort = Number(process.env.HTTP_PORT ?? config.httpPort ?? 9013);
  console.log(`[twin:${config.name}] HTTP port: env=${process.env.HTTP_PORT}, config.httpPort=${config.httpPort}, final=${httpPort}`);

  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({
        agent: config.name,
        protocol: config.protocol,
        ready: true,
      }));
      return;
    }

    if (req.url !== '/ask' || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }

    // Read request body
    let body = '';
    await new Promise<void>((resolve, reject) => {
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve());
      req.on('error', reject);
      setTimeout(() => reject(new Error('request timeout')), 5000);
    });

    let request: any;
    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid json' }));
      return;
    }

    const { message, context } = request;
    if (!message) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'missing message field' }));
      return;
    }

    let answer = '';
    let verified = false;
    let selectedSkill = '';

    try {
      // Auto-select skills for the message
      const selected = selectSkillsForTask(agentSkills, message, 3);
      selectedSkill = selected.length ? selected[0].skill.name : '';
      const skillPrompt = buildSkillPrompt(selected, message);

      const systemPrompt = [
        config.mission,
        config.boundaries?.length ? `\nBoundaries:\n${config.boundaries.map((b) => `- ${b}`).join('\n')}` : '',
      ].filter(Boolean).join('\n');

      const messages = [
        { role: 'system' as const, content: systemPrompt },
      ];
      if (context) {
        messages.push({ role: 'user' as const, content: `Context: ${context}` });
      }
      messages.push({ role: 'user' as const, content: skillPrompt });

      const result = await verifiedReason(messages);
      answer = result.text;
      verified = result.verified;
    } catch (e) {
      answer = `Error: ${(e as Error).message}`;
    }

    // Log interaction
    interactionCount++;
    appendIntegrationEvent(config.name, {
      task: 'http_ask',
      outcome: verified ? 'success' : 'unverified',
      integration: 'http',
      notes: `Q: ${message.slice(0, 100)} | skill: ${selectedSkill}`,
    }).catch(() => {});

    // Trigger evolution
    if (interactionCount % EVOLUTION_INTERVAL === 0) {
      console.log(`[twin:${config.name}] evolution trigger (${interactionCount} interactions)`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      answer,
      verified,
      skill: selectedSkill,
      from: config.name,
    }));
  });

  httpServer.on('error', (err) => {
    console.error(`[twin:${config.name}] HTTP server error on port ${httpPort}:`, err.message);
  });

  httpServer.listen(httpPort, () => {
    console.log(`[twin:${config.name}] HTTP /ask server on :${httpPort}`);
  });

    console.log(`[twin:${config.name}] ready — listening on AXL + HTTP`);
    await pumpRecv(axl, onMessage, ac.signal);
  } catch (e) {
    console.error(`[twin:${config.name}] FATAL ERROR:`, (e as Error).message);
    throw e;
  }
}
