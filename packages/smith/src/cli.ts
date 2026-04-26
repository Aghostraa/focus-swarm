// CLI: pnpm -F @focus-swarm/smith <command> -- [flags]
//   mint    --archetype=<slug> --cohort=<n> --market=<str>
//   awaken  --market=<str> --brief=<str> [--limit=<n>]
import { generatePersona, mintPersona, awakenPersonas } from './index.js';

function arg(name: string, def?: string) {
  const f = process.argv.find(a => a.startsWith(`--${name}=`));
  return f ? f.split('=').slice(1).join('=') : def;
}

const cmd = process.argv[2];

async function main() {
  if (cmd === 'awaken') {
    const market = arg('market') ?? 'general consumer';
    const brief = arg('brief') ?? '';
    const limit = Number(arg('limit', '6'));
    const results = await awakenPersonas(market, brief, limit);
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Default: mint
  const archetype = arg('archetype') ?? 'unspecified';
  const cohortId = Number(arg('cohort', '1'));
  const targetMarket = arg('market', 'general consumer');
  const spec = await generatePersona(targetMarket!, archetype, cohortId);
  const minted = await mintPersona(spec);
  console.log(JSON.stringify(minted, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
