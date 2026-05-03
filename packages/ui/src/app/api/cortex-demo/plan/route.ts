import { NextRequest, NextResponse } from 'next/server';
import { demoApiBase, proxyDemo } from '../_proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const TWINS = [
  {
    name: 'zerog-builder',
    protocol: '0G',
    ensName: 'zerog-builder.cortex.eth',
    url: 'http://127.0.0.1:9013/ask',
  },
  {
    name: 'axl-builder',
    protocol: 'AXL',
    ensName: 'axl-builder.cortex.eth',
    url: 'http://127.0.0.1:9023/ask',
  },
  {
    name: 'ens-builder',
    protocol: 'ENS',
    ensName: 'ens-builder.cortex.eth',
    url: 'http://127.0.0.1:9033/ask',
  },
];

const DEFAULT_DESCRIPTION =
  'Build a Cortex protocol buddy that stores brain state on 0G, discovers peers through ENS, and coordinates integration plans over AXL.';

export async function POST(req: NextRequest) {
  if (demoApiBase()) {
    const body = await req.text();
    return proxyDemo('/plan', { method: 'POST', body });
  }

  const body = await req.json().catch(() => ({}));
  const description = typeof body?.description === 'string' && body.description.trim() ? body.description.trim() : DEFAULT_DESCRIPTION;

  const twinPlans = await Promise.all(
    TWINS.map(async (twin) => {
      const started = Date.now();
      try {
        const res = await fetch(twin.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `You are a ${twin.protocol} protocol expert building a Cortex protocol buddy. Project: "${description}"\n\nProvide a concrete 4-step implementation plan that specifically uses ${twin.protocol}. Each step: title, what to build, and the exact SDK call or method to use. Be specific and actionable.`,
            context: 'Implementation plan generation. Respond with numbered steps.',
          }),
          signal: AbortSignal.timeout(90_000),
          cache: 'no-store',
        });
        const data = await res.json();
        return {
          protocol: twin.protocol,
          name: twin.name,
          ensName: twin.ensName,
          steps: data?.answer ?? 'No plan generated.',
          verified: data?.verified ?? false,
          ms: Date.now() - started,
          ok: res.ok,
        };
      } catch (e) {
        return {
          protocol: twin.protocol,
          name: twin.name,
          ensName: twin.ensName,
          steps: (e as Error).message,
          verified: false,
          ms: Date.now() - started,
          ok: false,
        };
      }
    }),
  );

  return NextResponse.json({ checkedAt: new Date().toISOString(), description, twinPlans });
}
