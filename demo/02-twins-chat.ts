#!/usr/bin/env tsx
// Demo 2: Two protocol twins exchange query/answer via AXL SwarmMsg
// Track: AXL ($5k) + 0G Agents ($7.5k)
// Shows: query/answer SwarmMsg, pumpRecv, peer-to-peer verified dialogue

import 'dotenv/config';
import { AxlClient, pumpRecv, type SwarmMsg } from '@cortex/core';
import { registerAgentEns, agentEnsTextRecords, verifiedReason } from '@cortex/kit';

const AXL_A = process.env.AXL_API_URL_A ?? 'http://127.0.0.1:9002';
const AXL_B = process.env.AXL_API_URL_B ?? 'http://127.0.0.1:9012';

async function main() {
  const axlA = new AxlClient(AXL_A);
  const axlB = new AxlClient(AXL_B);

  const [peerA, peerB] = await Promise.all([axlA.myPubkey(), axlB.myPubkey()]);
  console.log(`[demo:02] Twin A peer: ${peerA.slice(0, 16)}...`);
  console.log(`[demo:02] Twin B peer: ${peerB.slice(0, 16)}...`);

  // Register ENS identities.
  await Promise.all([
    registerAgentEns({ ensName: 'zerog-builder.cortex.eth', texts: agentEnsTextRecords({ axlPeerId: peerA, protocol: '0G' }) }),
    registerAgentEns({ ensName: 'ens-builder.cortex.eth', texts: agentEnsTextRecords({ axlPeerId: peerB, protocol: 'ENS' }) }),
  ]).catch((e) => console.warn('[demo:02] ENS register (non-fatal):', e.message));

  const requestId = `demo-${Date.now()}`;
  let answered = false;

  // Twin B listens for query, answers with 0G Compute.
  const acB = new AbortController();
  pumpRecv(axlB, async (msg: SwarmMsg, from: string) => {
    if (msg.type !== 'query' || msg.requestId !== requestId) return;
    console.log(`[demo:02] Twin B received query: "${msg.question}"`);
    const result = await verifiedReason([
      { role: 'system', content: 'You are an ENS expert. Answer concisely.' },
      { role: 'user', content: msg.question },
    ]);
    const answer: SwarmMsg = {
      type: 'answer',
      from: 'ens-builder',
      question: msg.question,
      answer: result.text,
      verified: result.verified,
      requestId,
    };
    await axlB.send(from, answer);
    console.log(`[demo:02] Twin B answered (verified=${result.verified}): ${result.text.slice(0, 80)}...`);
    acB.abort();
  }, acB.signal);

  // Twin A sends a query to Twin B.
  const query: SwarmMsg = {
    type: 'query',
    from: 'zerog-builder',
    question: 'How does CCIP-read work with ENS offchain resolvers?',
    requestId,
  };
  console.log('[demo:02] Twin A sending query to Twin B...');
  await axlA.send(peerB, query);

  // Twin A waits for the answer.
  const acA = new AbortController();
  setTimeout(() => acA.abort(), 30_000);
  await pumpRecv(axlA, async (msg: SwarmMsg) => {
    if (msg.type !== 'answer' || msg.requestId !== requestId) return;
    console.log(`[demo:02] Twin A received answer (verified=${msg.verified}): ${msg.answer.slice(0, 80)}...`);
    answered = true;
    acA.abort();
  }, acA.signal);

  if (!answered) throw new Error('No answer received within 30s');
  console.log('[demo:02] PASS');
}

main().catch((e) => { console.error('[demo:02] FAIL', e); process.exit(1); });
