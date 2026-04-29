import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionStore } from '../store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(HERE, '../../../../../../../infra/deploy/reports');

export async function GET(req: NextRequest) {
  const sessionId = new URL(req.url).searchParams.get('id') as string | null;
  if (!sessionId) return new Response('id required', { status: 400 });
  const sid: string = sessionId;

  const eventsPath = path.join(REPORTS_DIR, `${sid}.events.ndjson`);

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      let offset = 0;
      let closed = false;

      function send(data: string) {
        if (closed) return;
        controller.enqueue(enc.encode(`data: ${data}\n\n`));
      }

      function tick() {
        if (closed) return;

        // Check if session errored before events file appeared
        const state = sessionStore.get(sid);
        if (state?.status === 'error') {
          send(JSON.stringify({ type: 'error', message: state.error }));
          closed = true;
          controller.close();
          return;
        }

        if (!fs.existsSync(eventsPath)) {
          // Session starting — emit heartbeat so connection stays alive
          send(JSON.stringify({ type: 'heartbeat', ts: Date.now() }));
          setTimeout(tick, 1000);
          return;
        }

        const content = fs.readFileSync(eventsPath, 'utf8');
        const newContent = content.slice(offset);
        if (newContent) {
          offset = content.length;
          const lines = newContent.split('\n').filter(Boolean);
          for (const line of lines) {
            send(line);
            try {
              const event = JSON.parse(line);
              if (event.type === 'session-end') {
                // Moderator finished — orchestrator now runs synth + evolution (1-3 min).
                // Poll sessionStore until result is ready, error, or 5 min cap.
                const deadline = Date.now() + 300_000;
                const pollResult = () => {
                  if (closed) return;
                  const final = sessionStore.get(sid);
                  if (final?.status === 'done' && final.result) {
                    send(JSON.stringify({ type: 'result', result: final.result }));
                    closed = true;
                    controller.close();
                    return;
                  }
                  if (final?.status === 'error') {
                    send(JSON.stringify({ type: 'error', message: final.error ?? 'session failed' }));
                    closed = true;
                    controller.close();
                    return;
                  }
                  if (Date.now() > deadline) {
                    send(JSON.stringify({ type: 'error', message: 'synth/evolve timed out' }));
                    closed = true;
                    controller.close();
                    return;
                  }
                  // Heartbeat so the EventSource doesn't drop
                  send(JSON.stringify({ type: 'heartbeat', stage: 'synth-evolve', ts: Date.now() }));
                  setTimeout(pollResult, 2000);
                };
                pollResult();
                return;
              }
            } catch {}
          }
        }

        setTimeout(tick, 500);
      }

      tick();

      req.signal.addEventListener('abort', () => {
        closed = true;
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
