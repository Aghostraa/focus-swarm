#!/usr/bin/env tsx
// Demo 3: Resolve agent ENS name → agent.axl_peer text record (CCIP round-trip)
// Track: ENS ($5k)
// Shows: registerAgentEns, resolveAgentEns, agentEnsTextRecords, CCIP gateway

import 'dotenv/config';
import { registerAgentEns, resolveAgentEns, agentEnsTextRecords } from '@cortex/kit';

const GATEWAY = process.env.ENS_GATEWAY_URL ?? 'http://localhost:8787';
const ENS_NAME = 'ens-builder.cortex.eth';
const MOCK_PEER_ID = 'pub:demo-peer-' + Date.now().toString(36);
const MOCK_BRAIN_HASH = 'abc123def456' + Math.random().toString(36).slice(2);

async function main() {
  console.log(`[demo:03] Gateway: ${GATEWAY}`);
  console.log(`[demo:03] Registering ${ENS_NAME}...`);

  const texts = agentEnsTextRecords({
    protocol: 'ENS',
    axlPeerId: MOCK_PEER_ID,
    brainRootHash: MOCK_BRAIN_HASH,
  });
  console.log('[demo:03] Text records:', JSON.stringify(texts, null, 2));

  await registerAgentEns({ ensName: ENS_NAME, texts });
  console.log('[demo:03] Registered.');

  console.log(`[demo:03] Resolving ${ENS_NAME}...`);
  const record = await resolveAgentEns(ENS_NAME);
  console.log('[demo:03] Resolved record:', JSON.stringify(record, null, 2));

  const peerId = record.texts['agent.axl_peer'];
  const resume = record.texts['agent.resume'];

  if (peerId !== MOCK_PEER_ID) throw new Error(`axl_peer mismatch: got ${peerId}, expected ${MOCK_PEER_ID}`);
  if (!resume?.startsWith('0g://')) throw new Error(`agent.resume format wrong: ${resume}`);

  console.log(`[demo:03] agent.axl_peer: ${peerId}`);
  console.log(`[demo:03] agent.resume:   ${resume}`);
  console.log('[demo:03] CCIP gateway lookup successful.');
  console.log('[demo:03] PASS');
}

main().catch((e) => { console.error('[demo:03] FAIL', e); process.exit(1); });
