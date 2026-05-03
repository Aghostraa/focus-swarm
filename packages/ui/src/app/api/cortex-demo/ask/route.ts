import { NextRequest, NextResponse } from 'next/server';
import { demoApiBase, proxyDemo } from '../_proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TWINS = [
  {
    name: 'zerog-builder',
    protocol: '0G',
    url: 'http://127.0.0.1:9013/ask',
    question: 'How should a protocol buddy store its persistent brain and session memory on 0G?',
  },
  {
    name: 'axl-builder',
    protocol: 'AXL',
    url: 'http://127.0.0.1:9023/ask',
    question: 'How should protocol buddies exchange integration context without a central broker?',
  },
  {
    name: 'ens-builder',
    protocol: 'ENS',
    url: 'http://127.0.0.1:9033/ask',
    question: 'Which ENS text records make an agent discoverable and resumable?',
  },
];

async function askTwin(twin: typeof TWINS[number], override?: string) {
  const started = Date.now();
  try {
    const res = await fetch(twin.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: override || twin.question,
        context: 'Live Cortex demo UI. Answer briefly and mention the concrete repo integration.',
      }),
      signal: AbortSignal.timeout(75_000),
      cache: 'no-store',
    });
    const data = await res.json();
    return {
      ok: res.ok,
      name: twin.name,
      protocol: twin.protocol,
      question: override || twin.question,
      data,
      ms: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      name: twin.name,
      protocol: twin.protocol,
      question: override || twin.question,
      error: (e as Error).message,
      ms: Date.now() - started,
    };
  }
}

export async function POST(req: NextRequest) {
  if (demoApiBase()) {
    const body = await req.text();
    return proxyDemo('/ask', { method: 'POST', body });
  }

  const body = await req.json().catch(() => ({}));
  const question = typeof body?.question === 'string' && body.question.trim() ? body.question.trim() : undefined;
  const results = await Promise.all(TWINS.map((twin) => askTwin(twin, question)));
  return NextResponse.json({ checkedAt: new Date().toISOString(), results });
}
