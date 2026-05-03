import { NextResponse } from 'next/server';

export function demoApiBase(): string | null {
  const value = process.env.CORTEX_DEMO_API?.replace(/\/+$/, '');
  return value || null;
}

export async function proxyDemo(path: string, init?: RequestInit): Promise<NextResponse> {
  const base = demoApiBase();
  if (!base) throw new Error('CORTEX_DEMO_API is not set');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
    },
  });
}
