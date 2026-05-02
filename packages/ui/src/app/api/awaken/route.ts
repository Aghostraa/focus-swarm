import { NextRequest, NextResponse } from 'next/server';
import { awakenPersonas } from '@cortex/smith';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { market, brief, limit } = await req.json();
    if (!market || !brief) {
      return NextResponse.json({ error: 'market and brief required' }, { status: 400 });
    }
    const results = await awakenPersonas(market, brief, limit ?? 6);
    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
