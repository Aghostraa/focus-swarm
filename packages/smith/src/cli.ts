// CLI: pnpm -F @focus-swarm/smith mint -- --archetype=boomer-dad-houston --cohort=1 --market="..."
import { generatePersona, mintPersona } from './index.js';

function arg(name: string, def?: string) {
  const f = process.argv.find(a => a.startsWith(`--${name}=`));
  return f ? f.split('=').slice(1).join('=') : def;
}

async function main() {
  const archetype = arg('archetype') ?? 'unspecified';
  const cohortId = Number(arg('cohort', '1'));
  const targetMarket = arg('market', 'general consumer');
  const spec = await generatePersona(targetMarket!, archetype, cohortId);
  const minted = await mintPersona(spec);
  console.log(JSON.stringify(minted, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
