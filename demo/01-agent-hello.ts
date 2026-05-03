#!/usr/bin/env tsx
// Demo 1: Agent.create → ask → remember → recall → save → load via ENS
// Track: 0G Framework 
// Shows: Agent facade, 0G Storage (encrypted upload/download), 0G Compute (verified inference)

import 'dotenv/config';
import { Agent, type CortexManifest } from '@cortex/kit';

const manifest: CortexManifest = {
  name: 'hello-agent',
  ensName: process.env.DEMO_ENS_NAME ?? 'hello.cortex.eth',
  mission: 'You are a concise assistant. Answer in one sentence.',
  visibility: 'public',
};

async function main() {
  console.log('[demo:01] Creating agent...');
  const agent = await Agent.create(manifest, { axlApiUrl: process.env.AXL_API_URL });

  console.log(`[demo:01] Brain root hash: ${agent.brain.integrations.brainRootHash}`);
  console.log(`[demo:01] ENS: ${manifest.ensName}`);

  console.log('[demo:01] Asking question...');
  const { text, verified } = await agent.ask('What is 0G Storage in one sentence?');
  console.log(`[demo:01] Answer (verified=${verified}): ${text}`);

  console.log('[demo:01] Storing memory...');
  await agent.remember('last_demo', { ts: Date.now(), answer: text });
  const recalled = await agent.recall<{ ts: number; answer: string }>('last_demo');
  console.log(`[demo:01] Recalled: ${recalled?.answer?.slice(0, 60)}...`);

  console.log('[demo:01] Saving updated brain to 0G...');
  const { rootHash } = await agent.save();
  console.log(`[demo:01] Saved. New root hash: ${rootHash}`);

  console.log('[demo:01] Loading agent back via ENS...');
  const loaded = await Agent.load(manifest.ensName!, { aesKey: null });
  console.log(`[demo:01] Loaded agent: ${loaded.brain.identity.name}`);
  const { text: text2, verified: verified2 } = await loaded.ask('Confirm: what is 0G Storage?');
  console.log(`[demo:01] Reloaded answer (verified=${verified2}): ${text2.slice(0, 100)}`);

  console.log('[demo:01] PASS');
}

main().catch((e) => { console.error('[demo:01] FAIL', e); process.exit(1); });
