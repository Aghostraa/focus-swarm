import { runSession } from './index.js';

async function main() {
  const market = process.env.TARGET_MARKET ?? 'general consumers';
  const brief = process.env.PRODUCT_BRIEF ?? 'A new app for tracking habits.';
  const archetypes = (process.env.ARCHETYPES ?? 'genz-renter-berlin,boomer-dad-houston,solo-founder-mumbai').split(',');
  const cohortId = Number(process.env.COHORT_ID ?? Date.now());
  const r = await runSession({
    targetMarket: market,
    productBrief: brief,
    archetypes,
    cohortId,
    totalTurns: Number(process.env.TOTAL_TURNS ?? 9),
  });
  console.log(JSON.stringify(r, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
