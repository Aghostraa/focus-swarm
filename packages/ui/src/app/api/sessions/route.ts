import { NextRequest, NextResponse } from 'next/server';
import { runSession } from '@focus-swarm/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 600;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetMarket, productBrief, archetypes, totalTurns } = body ?? {};
    if (!Array.isArray(archetypes) || archetypes.length < 2) {
      return NextResponse.json({ error: 'archetypes must be an array of at least 2 slugs' }, { status: 400 });
    }
    const cohortId = Math.floor(Date.now() / 1000);
    const result = await runSession({
      targetMarket,
      productBrief,
      archetypes,
      cohortId,
      totalTurns: Number(totalTurns ?? 9),
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
