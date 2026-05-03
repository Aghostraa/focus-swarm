#!/usr/bin/env tsx
// Demo 5: Multi-agent development session orchestration via Cortex DevBuddy.
// Agents self-organize via AXL peer negotiation, generate architecture.

import 'dotenv/config';
import { runDevSession } from '@cortex/protocol-twins';

async function main() {
  console.log('[demo:05] Cortex DevBuddy — Multi-Agent Development Orchestration');
  console.log(
    '[demo:05] Testing: agent discovery, AXL peer negotiation, session orchestration\n',
  );

  const description =
    'Build a decentralized voting app with encrypted ballots on 0G, P2P validator mesh via AXL, and voter identity via ENS';

  // Discover agents from ENS gateway
  const gatewayUrl = process.env.ENS_GATEWAY_URL ?? 'http://127.0.0.1:8787';
  console.log(`[demo:05] Discovering agents from ${gatewayUrl}...\n`);

  let personas: any[] = [];
  try {
    const response = await fetch(`${gatewayUrl}/personas`);
    if (!response.ok) throw new Error(`${response.status}`);
    personas = await response.json();
    console.log(`[demo:05] Discovered ${personas.length} persona(s)\n`);
  } catch (e) {
    console.warn(`[demo:05] Gateway lookup failed (${(e as Error).message}), falling back to hardcoded agents\n`);
    personas = [
      { name: 'zerog-builder', 'agent.http_port': '9013', 'agent.axl_api_url': 'http://127.0.0.1:9022' },
      { name: 'axl-builder', 'agent.http_port': '9023', 'agent.axl_api_url': 'http://127.0.0.1:9002' },
      { name: 'ens-builder', 'agent.http_port': '9033', 'agent.axl_api_url': 'http://127.0.0.1:9012' },
    ];
  }

  const agents = personas.map(p => ({
    name: p.name,
    httpPort: parseInt(p['agent.http_port'] || p.httpPort || '9013'),
    axlApiUrl: p['agent.axl_api_url'] || p.axlApiUrl || 'http://127.0.0.1:9002',
  }));

  console.log(`[demo:05] Project: "${description}"\n`);
  console.log(`[demo:05] Running DevSession with ${agents.length} agents...\n`);

  const session = await runDevSession(description, agents, { timeoutMs: 20_000 });

  console.log(`\n[demo:05] Session ${session.projectId} complete`);
  console.log(`[demo:05]   Capabilities: ${session.capabilities.length}`);
  console.log(`[demo:05]   Peer exchanges: ${session.peerExchanges.length}`);
  console.log(`[demo:05]   Implementation order: ${session.implementationOrder.length}`);

  // Assertions
  if (session.capabilities.length !== 3) {
    throw new Error(`Expected 3 capabilities, got ${session.capabilities.length}`);
  }

  if (session.peerExchanges.length < 3) {
    throw new Error(`Expected ≥3 peer exchanges, got ${session.peerExchanges.length}`);
  }

  if (session.implementationOrder.length !== 3) {
    throw new Error(`Expected 3 agents in order, got ${session.implementationOrder.length}`);
  }

  // Print capabilities
  console.log('\n[demo:05] Agent Roles:');
  for (const cap of session.capabilities) {
    console.log(`  ${cap.agent}: ${cap.role}`);
  }

  // Print implementation order
  console.log('\n[demo:05] Implementation Order:');
  for (const agent of session.implementationOrder) {
    console.log(`  ${agent}`);
  }

  // Print peer exchanges
  console.log('\n[demo:05] Peer Exchanges (AXL):');
  for (const ex of session.peerExchanges.slice(0, 3)) {
    console.log(`  ${ex.from} → ${ex.to}: "${ex.question.slice(0, 60)}..."`);
    console.log(`    → verified=${ex.verified}, skill=${ex.skill}`);
  }

  console.log('\n[demo:05] PASS');
}

main().catch((e) => {
  console.error('[demo:05] FAIL', e);
  process.exit(1);
});
