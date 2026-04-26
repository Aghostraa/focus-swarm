// AXL HTTP client — talks to a local AXL node bridge.
// Each persona / moderator process sits next to its own AXL node and uses this
// client to send/recv encrypted P2P messages over the Yggdrasil mesh.

export interface AxlTopology {
  our_ipv6: string;
  our_public_key: string;
  peers: Array<{ peer_id: string; up: boolean; direction?: string } | Record<string, unknown>>;
  tree: unknown[];
}

export class AxlClient {
  constructor(public readonly api: string) {}

  async topology(): Promise<AxlTopology> {
    const r = await fetch(`${this.api}/topology`);
    if (!r.ok) throw new Error(`topology ${r.status}`);
    return (await r.json()) as AxlTopology;
  }

  async myPubkey(): Promise<string> {
    return (await this.topology()).our_public_key;
  }

  /** Fire-and-forget binary send. We always pass JSON UTF-8 bytes. */
  async send(peerId: string, payload: unknown): Promise<void> {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const r = await fetch(`${this.api}/send`, {
      method: 'POST',
      headers: {
        'X-Destination-Peer-Id': peerId,
        'Content-Type': 'application/octet-stream',
      },
      body: new TextEncoder().encode(body),
    });
    if (!r.ok) throw new Error(`send ${r.status}: ${await r.text()}`);
  }

  /** Long-poll receive. Returns null on 204 (queue empty). */
  async recv(): Promise<{ from: string; body: string } | null> {
    const r = await fetch(`${this.api}/recv`);
    if (r.status === 204) return null;
    if (!r.ok) throw new Error(`recv ${r.status}`);
    const from = r.headers.get('X-From-Peer-Id') ?? '';
    const body = await r.text();
    return { from, body };
  }
}

/**
 * Standard envelope used by focus-swarm over AXL `/send`. Personas and the
 * moderator dispatch on `type`.
 */
export type SwarmMsg =
  | { type: 'turn'; sessionId: string; speaker: string; prompt: string; transcriptTail: TranscriptEntry[] }
  | { type: 'utterance'; sessionId: string; speaker: string; text: string; ts: number }
  | { type: 'observation'; sessionId: string; source: string; content: string; ts: number }
  | { type: 'session-end'; sessionId: string };

export interface TranscriptEntry {
  speaker: string;
  text: string;
  ts: number;
}

/** Convenience: subscribe to /recv until a stop signal. */
export async function pumpRecv(
  axl: AxlClient,
  onMessage: (msg: SwarmMsg, fromPeer: string) => void | Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      const m = await axl.recv();
      if (!m) {
        await new Promise((s) => setTimeout(s, 200));
        continue;
      }
      let parsed: SwarmMsg;
      try {
        parsed = JSON.parse(m.body) as SwarmMsg;
      } catch {
        continue;
      }
      await onMessage(parsed, m.from);
    } catch (e) {
      if (signal.aborted) return;
      console.warn('[axl] recv error', (e as Error).message);
      await new Promise((s) => setTimeout(s, 1000));
    }
  }
}
