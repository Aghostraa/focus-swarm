// Initialize profile in 0G KV with proper replication.
// Usage: pnpm profile:init (via package.json script)

import 'dotenv/config';
import { setAgentState } from '@cortex/kit';
import { loadProfileContext, summarizeProfile } from './profile.js';

const AGENT_NAME = 'apply-twin';

async function main() {
  console.log('Loading local profile context...');
  const context = await loadProfileContext();

  const profile = {
    summary: context.profileContext.split('\n')[0],
    experience: context.profileContext,
    skills: [],
    targetRoles: [],
    culture: context.styleGuide,
  };

  console.log('Uploading to 0G KV with replicas=3...');
  console.log('Profile:', JSON.stringify(profile, null, 2).slice(0, 200) + '...');

  await setAgentState(AGENT_NAME, 'profile', profile);
  console.log('✓ Profile initialized in 0G KV');
  console.log('✓ Replicas=3 — data will sync to public KV node within ~5 min');
  console.log('✓ Ready: pnpm twin');
}

main().catch((e) => {
  console.error('Init failed:', e.message);
  process.exit(1);
});
