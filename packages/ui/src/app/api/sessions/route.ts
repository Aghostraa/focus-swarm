import { NextRequest, NextResponse } from 'next/server';
import { runSession } from '@focus-swarm/orchestrator';
import { sessionStore } from './store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetMarket, productBrief, archetypes, reusePersonas, totalTurns, moderatorConfig } = body ?? {};
    const newArchetypes: string[] = Array.isArray(archetypes) ? archetypes : [];
    const reused = Array.isArray(reusePersonas) ? reusePersonas : [];
    if (newArchetypes.length + reused.length < 2) {
      return NextResponse.json({ error: 'need at least 2 personas total' }, { status: 400 });
    }
    const cohortId = Math.floor(Date.now() / 1000);
    const sessionId = `s-${cohortId}-${Date.now().toString(36)}`;

    const participants = reused.map((r: any) => ({
      archetype: r.archetype ?? r.ensName?.split('.')[0] ?? 'unknown',
      role: r.role ?? 'consumer',
      ensName: r.ensName ?? '',
    }));

    sessionStore.set(sessionId, { status: 'running', participants });

    runSession({
      targetMarket, productBrief,
      archetypes: newArchetypes,
      reusePersonas: reused,
      cohortId,
      totalTurns: Number(totalTurns ?? 9),
      moderatorConfig,
    }).then((result) => {
      sessionStore.set(sessionId, { status: 'done', participants, result });
    }).catch((e: Error) => {
      sessionStore.set(sessionId, { status: 'error', participants, error: e.message });
    });

    return NextResponse.json({ sessionId, participants });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sessionId = new URL(req.url).searchParams.get('id');
  if (!sessionId) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const state = sessionStore.get(sessionId);
  if (!state) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(state);
}
