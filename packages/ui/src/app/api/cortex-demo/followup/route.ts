import { NextRequest, NextResponse } from 'next/server';
import { demoApiBase, proxyDemo } from '../_proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const TWINS = [
  { name: 'zerog-builder', protocol: '0G', url: 'http://127.0.0.1:9013/evolve' },
  { name: 'axl-builder',   protocol: 'AXL', url: 'http://127.0.0.1:9023/evolve' },
  { name: 'ens-builder',   protocol: 'ENS', url: 'http://127.0.0.1:9033/evolve' },
];

export async function POST(req: NextRequest) {
  if (demoApiBase()) {
    const body = await req.text();
    return proxyDemo('/followup', { method: 'POST', body });
  }

  const body = await req.json().catch(() => ({}));
  const message = typeof body?.message === 'string' && body.message.trim() ? body.message.trim() : '';
  const projectId = typeof body?.projectId === 'string' ? body.projectId : undefined;

  if (!message) {
    return NextResponse.json({ error: 'missing message' }, { status: 400 });
  }

  const results = await Promise.all(
    TWINS.map(async (twin) => {
      const started = Date.now();
      try {
        const res = await fetch(twin.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ failureMessage: message, projectId }),
          signal: AbortSignal.timeout(110_000),
          cache: 'no-store',
        });
        const data = await res.json();
        return { protocol: twin.protocol, name: twin.name, ok: res.ok, data, ms: Date.now() - started };
      } catch (e) {
        return { protocol: twin.protocol, name: twin.name, ok: false, error: (e as Error).message, ms: Date.now() - started };
      }
    }),
  );

  return NextResponse.json({ checkedAt: new Date().toISOString(), message, projectId, results });
}
