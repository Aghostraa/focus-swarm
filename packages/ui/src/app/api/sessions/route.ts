import { NextRequest, NextResponse } from 'next/server';
import { runSession } from '@focus-swarm/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 600;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetMarket, productBrief, archetypes, reusePersonas, totalTurns, moderatorConfig } = body ?? {};
    const newArchetypes: string[] = Array.isArray(archetypes) ? archetypes : [];
    const reused = Array.isArray(reusePersonas) ? reusePersonas : [];
    if (newArchetypes.length + reused.length < 2) {
      return NextResponse.json({ error: 'need at least 2 personas total (new archetypes + reused)' }, { status: 400 });
    }
    const cohortId = Math.floor(Date.now() / 1000);
    const result = await runSession({
      targetMarket,
      productBrief,
      archetypes: newArchetypes,
      reusePersonas: reused,
      cohortId,
      totalTurns: Number(totalTurns ?? 9),
      moderatorConfig,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
