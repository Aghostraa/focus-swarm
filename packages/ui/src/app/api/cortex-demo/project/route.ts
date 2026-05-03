import { NextRequest, NextResponse } from 'next/server';
import { demoApiBase, proxyDemo } from '../_proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TWINS = [
  { name: 'zerog-builder', protocol: '0G', url: 'http://127.0.0.1:9013' },
  { name: 'axl-builder', protocol: 'AXL', url: 'http://127.0.0.1:9023' },
  { name: 'ens-builder', protocol: 'ENS', url: 'http://127.0.0.1:9033' },
];

async function postProject(twin: typeof TWINS[number], projectId: string, description: string) {
  const started = Date.now();
  try {
    const res = await fetch(`${twin.url}/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, description }),
      signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    });
    const data = await res.json();
    return { ok: res.ok, name: twin.name, protocol: twin.protocol, data, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, name: twin.name, protocol: twin.protocol, error: (e as Error).message, ms: Date.now() - started };
  }
}

async function getSession(twin: typeof TWINS[number], projectId: string) {
  const started = Date.now();
  try {
    const res = await fetch(`${twin.url}/session/${encodeURIComponent(projectId)}`, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const data = await res.json();
    return { ok: res.ok, name: twin.name, protocol: twin.protocol, data, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, name: twin.name, protocol: twin.protocol, error: (e as Error).message, ms: Date.now() - started };
  }
}

export async function POST(req: NextRequest) {
  if (demoApiBase()) {
    const body = await req.text();
    return proxyDemo('/project', { method: 'POST', body });
  }

  const body = await req.json().catch(() => ({}));
  const description =
    typeof body?.description === 'string' && body.description.trim()
      ? body.description.trim()
      : 'Build a Cortex protocol buddy that stores brain state on 0G, discovers peers through ENS, and coordinates integration plans over AXL.';
  const projectId =
    typeof body?.projectId === 'string' && body.projectId.trim()
      ? body.projectId.trim()
      : `ui-${Date.now().toString(36)}`;
  const waitMs = Number.isFinite(Number(body?.waitMs)) ? Math.max(0, Math.min(15000, Number(body.waitMs))) : 3500;

  const declarations = await Promise.all(TWINS.map((twin) => postProject(twin, projectId, description)));

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const sessions = await Promise.all(TWINS.map((twin) => getSession(twin, projectId)));

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    projectId,
    description,
    declarations,
    sessions,
  });
}
