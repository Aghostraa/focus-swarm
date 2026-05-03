// Protocol twin runtime — persistent process per twin.
// Boots AXL node, loads brain from 0G via ENS, pumps /recv,
// responds to query SwarmMsg with verified 0G Compute,
// persists answer to 0G episodic log, routes cross-twin queries via ENS lookup.

import 'dotenv/config';
import * as fs from 'node:fs';
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
  type ChatMsg,
} from '@cortex/kit';
import type { TwinConfig, CapabilityRecord, PeerExchange } from './index.js';

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

  // Session state for project orchestration
  const sessions = new Map<string, { caps: CapabilityRecord; peerExchanges: PeerExchange[] }>();
  let isEvolving = false;
  let lastEvolved: number | null = null;

  const onMessage = async (msg: SwarmMsg, fromPeer: string) => {
    // Handle peer_query — agent-to-agent negotiation during project discovery
    if (msg.type === 'peer_query') {
      console.log(`[twin:${config.name}] peer_query from=${fromPeer.slice(0, 12)} question="${msg.question.slice(0, 60)}..."`);
      try {
        const selected = selectSkillsForTask(agentSkills, msg.question, 3);
        const selectedSkill = selected.length ? selected[0].skill.name : '';
        const skillPrompt = buildSkillPrompt(selected, msg.question);

        const systemPrompt = [
          config.mission,
          config.boundaries?.length ? `\nBoundaries:\n${config.boundaries.map((b) => `- ${b}`).join('\n')}` : '',
        ].filter(Boolean).join('\n');

        const messages: ChatMsg[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: skillPrompt },
        ];

        const result = await verifiedReason(messages);
        const answer: SwarmMsg = {
          type: 'peer_answer',
          projectId: msg.projectId,
          from: config.name,
          answer: result.text,
          skill: selectedSkill,
          verified: result.verified,
          requestId: msg.requestId,
        };
        await axl.send(fromPeer, answer).catch((e) => {
          console.warn(`[twin:${config.name}] peer_answer send failed:`, (e as Error).message);
        });

        // Store in session if active
        const session = sessions.get(msg.projectId);
        if (session) {
          session.peerExchanges.push({
            from: fromPeer.slice(0, 12),
            to: config.name,
            question: msg.question,
            answer: result.text,
            verified: result.verified,
            skill: selectedSkill,
          });
        }
      } catch (e) {
        console.warn(`[twin:${config.name}] peer_query handling failed:`, (e as Error).message);
      }
      return;
    }

    // Handle peer_answer — store received negotiation response
    if (msg.type === 'peer_answer') {
      console.log(`[twin:${config.name}] peer_answer from=${msg.from}`);
      const session = sessions.get(msg.projectId);
      if (session) {
        session.peerExchanges.push({
          from: msg.from,
          to: config.name,
          question: `[exchanged]`,
          answer: msg.answer,
          verified: msg.verified,
          skill: msg.skill,
        });
      }
      return;
    }

    // Handle skill_evolved — log peer evolution notification
    if (msg.type === 'skill_evolved') {
      console.log(`[twin:${config.name}] skill_evolved: ${msg.from} updated ${msg.skillName} → ${msg.newHash.slice(0, 12)}...`);
      return;
    }

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

      const messages: ChatMsg[] = [
        { role: 'system', content: systemPrompt },
      ];
      if (msg.context) {
        messages.push({ role: 'user', content: `Context: ${msg.context}` });
      }
      messages.push({ role: 'user', content: skillPrompt });

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
      outcome: verified ? 'worked' : 'partial',
      protocol: config.protocol ?? 'unknown',
      error: verified ? undefined : `Q: ${msg.question.slice(0, 100)} | A: ${answer.slice(0, 200)} | skill: ${selectedSkill}`,
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
    const pathname = req.url?.split('?')[0] || '/';

    if (pathname === '/' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({
        agent: config.name,
        protocol: config.protocol,
        ready: true,
      }));
      return;
    }

    // GET /capabilities — instant agent metadata
    if (pathname === '/capabilities' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        agent: config.name,
        protocol: config.protocol,
        skills: config.skills ?? [],
        httpPort: httpPort,
        ensName: config.ensName,
      }));
      return;
    }

    // GET /evolution-status — monitoring
    if (pathname === '/evolution-status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        lastEvolved,
        interactionCount,
        isEvolving,
        skillsLoaded: agentSkills.length,
      }));
      return;
    }

    // POST /project — agent capability declaration + peer query broadcast
    if (pathname === '/project' && req.method === 'POST') {
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

      const { description, projectId } = request;
      if (!description || !projectId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'missing description or projectId' }));
        return;
      }

      let role = '';
      let components: string[] = [];
      let needs: string[] = [];
      let provides: string[] = [];
      let verified = false;

      try {
        const systemPrompt = `You are ${config.name}, a ${config.protocol} expert.\nProject: ${description}\nRespond with ONLY valid JSON (no markdown):\n{"role":"...","components":["..."],"needs":["..."],"provides":["..."]}`;
        const result = await verifiedReason([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Declare your role for this project.' },
        ]);
        verified = result.verified;

        const cleanText = result.text.replace(/```json\n?|```\n?/g, '').trim();
        const parsed = JSON.parse(cleanText);
        role = parsed.role || '';
        components = Array.isArray(parsed.components) ? parsed.components : [];
        needs = Array.isArray(parsed.needs) ? parsed.needs : [];
        provides = Array.isArray(parsed.provides) ? parsed.provides : [];
      } catch (e) {
        console.warn(`[twin:${config.name}] project JSON parse failed:`, (e as Error).message);
        role = `${config.name} expert`;
        components = [];
        needs = [];
        provides = config.skills ?? [];
      }

      const caps: CapabilityRecord = { agent: config.name, role, components, needs, provides, verified };
      sessions.set(projectId, { caps, peerExchanges: [] });

      // Fire-and-forget peer queries to configured peers
      if (config.peerEnsNames?.length) {
        Promise.resolve().then(async () => {
          for (const peerEnsName of config.peerEnsNames!) {
            try {
              const peerRecord = await resolveAgentEns(peerEnsName);
              const peerPeerId = peerRecord.texts?.['agent.axl_peer'];
              if (!peerPeerId) {
                console.warn(`[twin:${config.name}] peer ${peerEnsName} has no axl_peer text record`);
                continue;
              }

              // Fixed peer query content per agent pair
              let question = '';
              if (config.name === 'zerog-builder') {
                if (peerEnsName.includes('axl')) question = `For project '${description}': how should my 0G storage layer integrate with your P2P sync?`;
                else if (peerEnsName.includes('ens')) question = `For project '${description}': what identity fields should I index in 0G KV for ENS resolution?`;
              } else if (config.name === 'axl-builder') {
                if (peerEnsName.includes('zerog')) question = `For project '${description}': how does P2P sync interact with 0G persistent storage?`;
                else if (peerEnsName.includes('ens')) question = `For project '${description}': what peer discovery records should I maintain for ENS-resolvable agents?`;
              } else if (config.name === 'ens-builder') {
                if (peerEnsName.includes('zerog')) question = `For project '${description}': what text records should I store per-agent in 0G KV?`;
                else if (peerEnsName.includes('axl')) question = `For project '${description}': how does ENS subname resolution discover AXL peer IDs?`;
              }

              if (question) {
                const query: SwarmMsg = {
                  type: 'peer_query',
                  projectId,
                  from: config.name,
                  question,
                  requestId: `pq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                };
                await axl.send(peerPeerId, query).catch((e) => {
                  console.warn(`[twin:${config.name}] peer query to ${peerEnsName} failed:`, (e as Error).message);
                });
              }
            } catch (e) {
              console.warn(`[twin:${config.name}] resolveAgentEns ${peerEnsName} failed:`, (e as Error).message);
            }
          }
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...caps, projectId }));
      return;
    }

    // GET /session/:projectId — return accumulated session data
    const sessionMatch = pathname.match(/^\/session\/([a-zA-Z0-9_-]+)$/);
    if (sessionMatch && req.method === 'GET') {
      const projectId = sessionMatch[1];
      const session = sessions.get(projectId);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'session not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        projectId,
        caps: session.caps,
        peerExchanges: session.peerExchanges,
        complete: session.peerExchanges.length >= 2,
      }));
      return;
    }

    // POST /evolve — trigger skill evolution from failure report
    if (pathname === '/evolve' && req.method === 'POST') {
      let body = '';
      await new Promise<void>((resolve, reject) => {
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve());
        req.on('error', reject);
        setTimeout(() => reject(new Error('request timeout')), 5000);
      });

      let request: any = {};
      try { request = JSON.parse(body); } catch { /* treat as empty */ }

      const failureMessage: string = typeof request.failureMessage === 'string' ? request.failureMessage.trim() : '';
      const projectId: string | undefined = typeof request.projectId === 'string' ? request.projectId : undefined;

      // Append failure event to episodic log so evolveSkills() can see it
      if (failureMessage) {
        await appendIntegrationEvent(config.name, {
          task: 'followup_failure',
          outcome: 'failed',
          protocol: config.protocol ?? 'unknown',
          error: `Q: ${failureMessage} | followup from researcher`,
        }).catch(() => {});

        // Also inject into the active session transcript for display
        if (projectId) {
          const session = sessions.get(projectId);
          if (session) {
            session.peerExchanges.push({
              from: 'researcher',
              to: config.name,
              question: failureMessage,
              answer: '[evolution triggered — processing gaps…]',
              verified: false,
              skill: 'followup',
            });
          }
        }
      }

      // Snapshot skills before evolution for diff
      const skillsBefore = agentSkills.map((s) => ({ name: s.name, hash: s.hash ?? null }));

      isEvolving = true;
      let evolutionResult: any = { evolved: false, skillsUpdated: [], reason: 'no gaps' };
      try {
        const { evolveSkills } = await import('./evolve.js');
        evolutionResult = await evolveSkills(config.name, agentSkills, skillDir, {
          focus: failureMessage || undefined,
          directGaps: failureMessage ? [failureMessage] : undefined,
        });
      } catch (e) {
        evolutionResult = { evolved: false, skillsUpdated: [], reason: (e as Error).message };
      }
      isEvolving = false;
      lastEvolved = Date.now();

      // Reload skills after evolution
      let skillsAfter: any[] = skillsBefore;
      try {
        const { loadSkillDirectory } = await import('@cortex/kit');
        const reloaded = await loadSkillDirectory(skillDir);
        agentSkills = reloaded.filter((s: any) => config.skills?.includes(s.name));
        skillsAfter = agentSkills.map((s) => ({ name: s.name, hash: s.hash ?? null }));
      } catch { /* keep old skills */ }

      // Update session transcript with outcome
      if (projectId) {
        const session = sessions.get(projectId);
        if (session) {
          const lastEntry = session.peerExchanges[session.peerExchanges.length - 1];
          if (lastEntry?.answer?.startsWith('[evolution triggered')) {
            lastEntry.answer = evolutionResult.evolved
              ? `[evolved] Updated: ${evolutionResult.skillsUpdated.join(', ')} — ${evolutionResult.reason}`
              : `[no change] ${evolutionResult.reason}`;
            lastEntry.verified = evolutionResult.evolved;
            lastEntry.skill = 'evolve';
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        agent: config.name,
        protocol: config.protocol,
        failureMessage,
        ...evolutionResult,
        skillsBefore,
        skillsAfter,
        interactionCount,
        lastEvolved,
      }));
      return;
    }

    if (pathname !== '/ask' || req.method !== 'POST') {
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

      const messages: ChatMsg[] = [
        { role: 'system', content: systemPrompt },
      ];
      if (context) {
        messages.push({ role: 'user', content: `Context: ${context}` });
      }
      messages.push({ role: 'user', content: skillPrompt });

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
      outcome: verified ? 'worked' : 'partial',
      protocol: 'http',
      error: verified ? undefined : `Q: ${message.slice(0, 100)} | skill: ${selectedSkill}`,
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
