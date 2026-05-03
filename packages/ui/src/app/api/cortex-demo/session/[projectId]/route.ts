import { NextRequest, NextResponse } from 'next/server';
import { demoApiBase, proxyDemo } from '../../_proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TWINS = [
  { name: 'zerog-builder', protocol: '0G', url: 'http://127.0.0.1:9013' },
  { name: 'axl-builder', protocol: 'AXL', url: 'http://127.0.0.1:9023' },
  { name: 'ens-builder', protocol: 'ENS', url: 'http://127.0.0.1:9033' },
];

async function getJson(url: string, timeoutMs = 8000) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, data, error: res.ok ? undefined : `HTTP ${res.status}`, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, error: (e as Error).message, ms: Date.now() - started };
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await ctx.params;
  if (demoApiBase()) return proxyDemo(`/session/${encodeURIComponent(projectId)}`);

  const [sessions, evolutions] = await Promise.all([
    Promise.all(TWINS.map((twin) => getJson(`${twin.url}/session/${encodeURIComponent(projectId)}`))),
    Promise.all(TWINS.map((twin) => getJson(`${twin.url}/evolution-status`, 3000))),
  ]);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    projectId,
    sessions: TWINS.map((twin, i) => ({ ...twin, ...sessions[i] })),
    evolutions: TWINS.map((twin, i) => ({ ...twin, ...evolutions[i] })),
  });
}
