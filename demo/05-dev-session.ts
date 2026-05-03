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

  const agents = [
    { name: 'zerog-builder', httpPort: 9013, axlApiUrl: 'http://127.0.0.1:9022' },
    { name: 'axl-builder', httpPort: 9023, axlApiUrl: 'http://127.0.0.1:9002' },
    { name: 'ens-builder', httpPort: 9033, axlApiUrl: 'http://127.0.0.1:9012' },
  ];

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
