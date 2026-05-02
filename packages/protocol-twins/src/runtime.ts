// Protocol twin runtime — persistent process per twin.
// Boots AXL node, loads brain from 0G via ENS, pumps /recv,
// responds to query SwarmMsg with verified 0G Compute,
// persists answer to 0G episodic log, routes cross-twin queries via ENS lookup.

import 'dotenv/config';
import fs from 'node:fs';
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
} from '@cortex/kit';
import type { TwinConfig } from './index.js';

export async function runTwin(config: TwinConfig): Promise<void> {
  const axlApiUrl = config.axlApiUrl ?? process.env.AXL_API_URL ?? 'http://127.0.0.1:9002';
  const axlMcpUrl = config.axlMcpUrl ?? process.env.AXL_MCP_URL;
  const axl = new AxlClient(axlApiUrl);

  const myPeerId = await axl.myPubkey();
  console.log(`[twin:${config.name}] axl=${axlApiUrl} peer=${myPeerId.slice(0, 12)}...`);

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
  if (config.ensName) {
    try {
      await registerAgentEns({
        ensName: config.ensName,
        texts: agentEnsTextRecords({
          protocol: config.protocol,
          axlPeerId: myPeerId,
        }),
      });
      console.log(`[twin:${config.name}] ENS registered: ${config.ensName}`);
    } catch (e) {
      console.warn(`[twin:${config.name}] ENS register failed:`, (e as Error).message);
    }
  }

  const ac = new AbortController();
  process.on('SIGINT', () => ac.abort());
  process.on('SIGTERM', () => ac.abort());

  const onMessage = async (msg: SwarmMsg, fromPeer: string) => {
    if (msg.type !== 'query') return;

    console.log(`[twin:${config.name}] query from=${fromPeer.slice(0, 12)} id=${msg.requestId}`);

    let answer: string;
    let verified = false;

    try {
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
      messages.push({ role: 'user' as const, content: msg.question });

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
    appendIntegrationEvent(config.name, {
      task: 'query',
      outcome: verified ? 'success' : 'unverified',
      integration: config.protocol ?? 'unknown',
      notes: `Q: ${msg.question.slice(0, 100)} | A: ${answer.slice(0, 200)}`,
    }).catch(() => {});
  };

  console.log(`[twin:${config.name}] ready — listening on AXL`);
  await pumpRecv(axl, onMessage, ac.signal);
}
