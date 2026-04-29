'use client';

import { useState } from 'react';

interface AwakenResult {
  ensName: string;
  tokenId: number;
  archetype: string;
  targetMarket: string;
  applicationText: string;
  verified: boolean;
  rootHash: string;
  keyPath: string;
  spec?: any;
  role?: string;
  skills?: {
    sessionCount: number;
    domainKnowledge: Record<string, number>;
    uxLiteracy: number;
    technicalDepth: number;
    communicationMaturity: number;
  };
}

interface PersonaInsight {
  ensName: string;
  role: string;
  sessionCount: number;
  topDomains: string[];
  keyContribution: string;
}

interface PersonaEvolution {
  tokenId: number;
  ensName: string;
  newRootHash: string | null;
  sessionCount: number;
}

interface LiveEvent {
  type: 'utterance' | 'thinking' | 'timeout' | 'session-end' | 'result' | 'error' | 'heartbeat';
  speaker?: string;
  archetype?: string;
  role?: string;
  ensName?: string;
  text?: string;
  probe?: string;
  turn?: number;
  ts?: number;
}

interface Participant {
  archetype: string;
  role: string;
  ensName: string;
}

interface SessionResult {
  sessionId: string;
  cohortId: number;
  personas: Array<{ tokenId: number; ensName: string; rootHash: string; txHash: string }>;
  reusedPersonas: Array<{ tokenId: number; ensName: string }>;
  transcriptPath: string;
  reportPath: string;
  reportRootHash: string | null;
  report: {
    productBrief: string;
    participantCount: number;
    utteranceCount: number;
    themes: string[];
    contradictions: string[];
    painPoints: string[];
    opportunities: string[];
    scores: { ease: number; novelty: number; trust: number; relevance: number };
    rawSummary: string;
    personaInsights: PersonaInsight[];
  };
  personaEvolutions: PersonaEvolution[];
}

export default function Home() {
  // Proposal form
  const [market, setMarket] = useState('AI agent developers and startup founders building on 0G, AXL, or ENS who need fast synthetic user research');
  const [brief, setBrief] = useState(
`focus-swarm — a synthetic focus group platform.

WHAT IT DOES
You write a 1-paragraph product brief and pick a target market (e.g. "solo founders in Berlin"). The platform spawns 3–8 AI personas matching that market, runs a moderated 9–12 turn discussion, and outputs a structured report (themes, pain points, contradictions, opportunities, persona-attributed insights, and 1–10 scores for ease/novelty/trust/relevance). Total time: 2–5 minutes per session.

THE PERSONAS
Each persona has a rich backstory: life history, values, formative experiences (called "traumas"), media diet, communication style, plus a Big-5 personality vector. They're grounded in real-world behavioral data (currently scraped from Watch Dogs Legion's NPC profiler — ~8000 facts about Londoners' jobs, daily routines, grievances). Each persona is assigned a role: technical-skeptic, user-advocate, pm, accessibility-lens, or consumer.

PERSISTENT MEMORY
After every session, each persona's brain is re-encrypted with updated skills — they accumulate domain knowledge (e.g. "fintech 0.7", "saas 0.4"), refine ux-literacy / technical-depth / communication-maturity, and keep the last 5 session summaries. Their next session starts smarter. This is provable on-chain: their ENS record's agent.resume hash changes after every session, and the encrypted blob at that hash is verifiably their new brain.

INFRASTRUCTURE (THIS IS WHERE IT GETS WEIRD)
- Persona brains live as iNFTs (ERC-7857) on 0G Storage, AES-256 encrypted. Owner controls the key.
- Inter-persona dialogue runs over Gensyn AXL — peer-to-peer mesh, no central message broker. Each persona has its own AXL node and ed25519 identity.
- All inference runs on 0G Compute (Qwen 2.5 7B) with TeeML verification — every reply has a cryptographic attestation that the model produced it.
- ENS subnames give each persona a discoverable identity: skeptical-engineer-crypto.cohort-99.focusgroup.eth.

PITCH IN ONE SENTENCE
"It's like UserTesting but the participants are NFTs that get smarter, you skip recruiting, and every word is cryptographically attested."

PRICING (UNDECIDED — REACT TO THESE)
- Pay-per-session: $25 for a 9-turn session with 3 personas, $50 for 6 personas, $100 for 12.
- OR subscription: $200/mo for unlimited sessions on a fixed cohort that grows with you.
- Persona iNFTs are tradeable — sell your trained personas on a marketplace.

WHO IT'S FOR
- Solo founders pre-product who can't afford $200/seat UserTesting and don't have a network to recruit from.
- Indie hackers validating ideas at the napkin stage.
- Product teams running rapid concept testing between real-user studies.

WHAT IT IS NOT
- Not a replacement for real user research. Synthetic focus groups have known biases (LLM blandness, hallucinated lived experience, no actual purchase behavior).
- Not faster than 30 seconds — each session takes 2–5 minutes because of TeeML verification and AXL handshake.
- Not free — every persona reply burns ~$0.01 on 0G Compute; a session of 9 turns × 6 personas ≈ $0.50 in compute.

KNOWN OBJECTIONS
- "Why do I need a blockchain for this? Can't I just prompt GPT-4 to roleplay 6 users?" — Yes, but you'd lose verifiability, persistence, and the persona being a tradeable asset.
- "How do I trust that the personas aren't all the same model with different prompts?" — TeeML attestation per reply + persona brains are public on 0G Storage (encrypted but auditable structure).
- "Watch Dogs Legion data? Really?" — It's a stand-in for a richer commercial dataset (e.g. census + ethnographic research) we'd license for production.

BUILT FOR
The 0G + Gensyn + ENS hackathon. Three tracks: 0G Autonomous Agents (primary), Gensyn AXL (peer-to-peer dialogue), ENS for AI Agents (identity).`
  );
  const [goals, setGoals] = useState(
`Is the iNFT/persistence angle a real differentiator or a gimmick wrapping a GPT prompt?
What's the actual price point at which someone would buy this over running their own prompts?
Which of the 3 user segments (solo founders, indie hackers, product teams) would actually convert, and which would churn?
Is "synthetic focus group" the right framing, or does it pre-anchor people to "fake research"?
What's the smallest version of this that's actually useful — and which features are dead weight?`
  );
  const [style, setStyle] = useState<'breadth' | 'deep-dive' | 'conflict-seeking'>('conflict-seeking');

  // Awaken state
  const [awakening, setAwakening] = useState(false);
  const [awakenError, setAwakenError] = useState<string | null>(null);
  const [awakenResults, setAwakenResults] = useState<AwakenResult[] | null>(null);
  const [selectedReuse, setSelectedReuse] = useState<Set<number>>(new Set());

  // Session builder
  const [archetypes, setArchetypes] = useState('skeptical-ux-researcher-london,solo-founder-berlin,technical-pm-singapore');
  const [turns, setTurns] = useState(18);

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [thinkingPersonas, setThinkingPersonas] = useState<Set<string>>(new Set());
  const [sessionDone, setSessionDone] = useState(false);
  const running = sessionId !== null && !sessionDone && !result;

  async function awaken() {
    setAwakening(true);
    setAwakenError(null);
    setAwakenResults(null);
    setSelectedReuse(new Set());
    try {
      const res = await fetch('/api/awaken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market, brief, limit: 6 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAwakenResults(data as AwakenResult[]);
    } catch (e) {
      setAwakenError((e as Error).message);
    } finally {
      setAwakening(false);
    }
  }

  function toggleReuse(tokenId: number) {
    setSelectedReuse((prev) => {
      const next = new Set(prev);
      next.has(tokenId) ? next.delete(tokenId) : next.add(tokenId);
      return next;
    });
  }

  async function runSession() {
    setSessionError(null);
    setResult(null);
    setLiveEvents([]);
    setThinkingPersonas(new Set());
    setSessionDone(false);
    setSessionId(null);
    setParticipants([]);

    const reusePersonas = (awakenResults ?? [])
      .filter((r) => selectedReuse.has(r.tokenId))
      .map((r) => ({ tokenId: r.tokenId, ensName: r.ensName, rootHash: r.rootHash, keyPath: r.keyPath, archetype: r.archetype, role: r.role, spec: (r as any).spec }));

    let sid: string;
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetMarket: market, productBrief: brief,
          archetypes: archetypes.split(',').map((s) => s.trim()).filter(Boolean),
          reusePersonas, totalTurns: turns,
          moderatorConfig: { researchGoals: goals.split('\n').map((s) => s.trim()).filter(Boolean), style },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      sid = data.sessionId;
      setSessionId(sid);
      setParticipants(data.participants ?? []);
    } catch (e) {
      setSessionError((e as Error).message);
      return;
    }

    // Subscribe to SSE stream
    const evtSource = new EventSource(`/api/sessions/stream?id=${sid}`);
    const ensureParticipant = (e: LiveEvent) => {
      if (!e.archetype) return;
      setParticipants((prev) => {
        if (prev.some((p) => p.archetype === e.archetype)) return prev;
        return [...prev, { archetype: e.archetype!, role: e.role ?? 'consumer', ensName: e.ensName ?? '' }];
      });
    };
    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as LiveEvent;
        if (event.type === 'thinking') {
          ensureParticipant(event);
          if (event.archetype) {
            setThinkingPersonas((prev) => new Set(prev).add(event.archetype!));
          }
        } else if (event.type === 'utterance') {
          ensureParticipant(event);
          if (event.archetype) {
            setThinkingPersonas((prev) => {
              const next = new Set(prev);
              next.delete(event.archetype!);
              return next;
            });
          }
          setLiveEvents((prev) => [...prev, event]);
        } else if (event.type === 'session-end') {
          setSessionDone(true);
          setThinkingPersonas(new Set());
        } else if (event.type === 'result') {
          setResult((event as any).result as SessionResult);
          evtSource.close();
        } else if (event.type === 'error') {
          setSessionError((event as any).message ?? 'session error');
          evtSource.close();
        }
      } catch {}
    };
    evtSource.onerror = () => evtSource.close();
  }

  return (
    <main>
      <h1 style={{ fontSize: 28, margin: 0, letterSpacing: '-0.02em' }}>focus-swarm</h1>
      <p style={{ color: '#9a9aa3', marginTop: 6 }}>Synthetic focus groups on 0G + AXL + ENS.</p>

      {/* Panel A — Research Proposal */}
      <section style={card}>
        <h2 style={h2}>1. Research proposal</h2>
        <Field label="Target market">
          <textarea value={market} onChange={(e) => setMarket(e.target.value)} style={input} rows={2} />
        </Field>
        <Field label="Product brief">
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} style={input} rows={3} />
        </Field>
        <Field label="Research goals (one per line)">
          <textarea value={goals} onChange={(e) => setGoals(e.target.value)} style={input} rows={3} />
        </Field>
        <Field label="Moderation style">
          <select value={style} onChange={(e) => setStyle(e.target.value as any)} style={input}>
            <option value="breadth">Breadth — cover diverse angles</option>
            <option value="deep-dive">Deep-dive — follow threads relentlessly</option>
            <option value="conflict-seeking">Conflict-seeking — surface disagreements</option>
          </select>
        </Field>
        <button onClick={awaken} disabled={awakening} style={btn}>
          {awakening ? 'Awakening personas…' : 'Awaken existing personas'}
        </button>
        {awakenError && <p style={errStyle}>Error: {awakenError}</p>}
        {awakening && <p style={hint}>Fetching catalog, loading brains from 0G, generating expressions of interest…</p>}
      </section>

      {/* Panel B — Cohort Builder */}
      {(awakenResults !== null || true) && (
        <section style={card}>
          <h2 style={h2}>2. Cohort builder</h2>

          {awakenResults && awakenResults.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: '#9a9aa3', fontSize: 13, margin: '0 0 10px' }}>
                {awakenResults.length} existing persona{awakenResults.length > 1 ? 's' : ''} responded — select any to include:
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                {awakenResults.map((r) => {
                  const selected = selectedReuse.has(r.tokenId);
                  return (
                    <div
                      key={r.tokenId}
                      onClick={() => toggleReuse(r.tokenId)}
                      style={{
                        ...personaCard,
                        border: selected ? '1px solid #7b65ff' : '1px solid #25252b',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: 13 }}>{r.archetype}</strong>
                          <span style={{ color: '#9a9aa3', fontSize: 11, marginLeft: 8 }}>{r.ensName}</span>
                          <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            {r.role && (
                              <span style={{ fontSize: 10, background: '#2a2a3a', color: '#7b65ff', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                                {r.role.replace(/-/g, ' ')}
                              </span>
                            )}
                            {r.skills && r.skills.sessionCount > 0 && (
                              <span style={{ fontSize: 10, color: '#9a9aa3' }}>
                                {r.skills.sessionCount} session{r.skills.sessionCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          background: selected ? '#7b65ff' : 'transparent',
                          border: '2px solid ' + (selected ? '#7b65ff' : '#3a3a42'),
                        }} />
                      </div>
                      {r.skills && Object.keys(r.skills.domainKnowledge).length > 0 && (
                        <DomainBars domains={r.skills.domainKnowledge} />
                      )}
                      <p style={{ color: '#c5c5cc', fontSize: 13, margin: '6px 0 0', fontStyle: 'italic' }}>
                        "{r.applicationText}"
                      </p>
                      <span style={{ fontSize: 11, color: r.verified ? '#4ade80' : '#fb923c' }}>
                        {r.verified ? '✓ TeeML verified' : '⚠ unverified'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {awakenResults !== null && awakenResults.length === 0 && (
            <p style={{ color: '#9a9aa3', fontSize: 13, marginTop: 0 }}>No existing personas matched this market. Generate new ones below.</p>
          )}

          <Field label="Generate new personas (comma-separated slugs)">
            <input value={archetypes} onChange={(e) => setArchetypes(e.target.value)} style={input} />
          </Field>
          <Field label="Target utterances (rounds = ceil(utterances / personas))">
            <input type="number" min={4} max={60} value={turns} onChange={(e) => setTurns(Number(e.target.value))} style={input} />
          </Field>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
            <button onClick={runSession} disabled={running} style={btn}>
              {running ? 'Running session…' : 'Run focus group'}
            </button>
            {(selectedReuse.size > 0 || archetypes.trim()) && (
              <span style={{ fontSize: 12, color: '#9a9aa3' }}>
                {selectedReuse.size} reused + {archetypes.split(',').filter((s) => s.trim()).length} new
              </span>
            )}
          </div>
          {sessionError && <p style={errStyle}>Error: {sessionError}</p>}
          {running && <p style={hint}>Minting personas, spawning AXL cohort, running moderated session, synthesising report…</p>}
        </section>
      )}

      {/* Panel Live — Session Grid */}
      {sessionId && !result && (
        <section style={card}>
          <h2 style={h2}>3. Live session{sessionDone ? ' — synthesising…' : ''}</h2>
          <p style={{ color: '#9a9aa3', fontSize: 12, margin: '0 0 14px' }}>
            {sessionDone ? 'Session complete. Running synthesiser…' : `Session ${sessionId} running · ${liveEvents.length} utterances`}
          </p>

          {/* Persona grid */}
          {participants.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(participants.length, 3)}, 1fr)`, gap: 10, marginBottom: 16 }}>
              {participants.map((p, i) => {
                const isThinking = thinkingPersonas.has(p.archetype);
                const lastMsg = [...liveEvents].reverse().find((e) => e.archetype === p.archetype && e.type === 'utterance');
                return (
                  <div key={i} style={{
                    background: isThinking ? '#1e1a2e' : '#1a1a1f',
                    border: isThinking ? '1px solid #7b65ff' : '1px solid #25252b',
                    borderRadius: 8, padding: 12, transition: 'all 0.3s',
                  }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: isThinking ? '#7b65ff' : '#2a2a3a',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, transition: 'background 0.3s',
                      }}>
                        {ROLE_ICON[p.role] ?? '🧑'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#e8e8ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.archetype}
                        </div>
                        <div style={{ fontSize: 10, color: '#7b65ff' }}>{p.role.replace(/-/g, ' ')}</div>
                      </div>
                    </div>
                    {isThinking ? (
                      <div style={{ fontSize: 12, color: '#7b65ff', fontStyle: 'italic' }}>
                        <Dots /> thinking…
                      </div>
                    ) : lastMsg?.text ? (
                      <p style={{ margin: 0, fontSize: 12, color: '#c5c5cc', lineHeight: 1.5, maxHeight: 72, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                        {lastMsg.text}
                      </p>
                    ) : (
                      <p style={{ margin: 0, fontSize: 12, color: '#4a4a52' }}>waiting…</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Transcript feed */}
          {liveEvents.length > 0 && (
            <div style={{ background: '#0e0e10', borderRadius: 8, padding: 12, maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {liveEvents.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                  <span style={{ color: '#7b65ff', flexShrink: 0, fontWeight: 600, minWidth: 120 }}>
                    {ROLE_ICON[e.role ?? ''] ?? '🧑'} {e.archetype ?? e.speaker?.slice(0, 8)}
                  </span>
                  <span style={{ color: '#c5c5cc', lineHeight: 1.5 }}>{e.text}</span>
                </div>
              ))}
            </div>
          )}

          {liveEvents.length === 0 && !sessionDone && (
            <p style={{ color: '#4a4a52', fontSize: 13 }}>Minting personas, booting AXL cohort… first utterances will appear here.</p>
          )}
        </section>
      )}

      {/* Panel C — Results */}
      {result && (
        <>
          <section style={card}>
            <h2 style={h2}>4. Cohort</h2>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {result.personas.map((p) => (
                <li key={p.tokenId} style={{ marginBottom: 6 }}>
                  <strong>{p.ensName}</strong> — token {p.tokenId} · <code style={codeStyle}>{p.rootHash.slice(0, 14)}…</code>
                </li>
              ))}
              {result.reusedPersonas?.map((p) => (
                <li key={`r-${p.tokenId}`} style={{ marginBottom: 6, color: '#9a9aa3' }}>
                  <strong>{p.ensName}</strong> — token {p.tokenId} <span style={{ fontSize: 11 }}>(reused)</span>
                </li>
              ))}
            </ul>
          </section>

          <section style={card}>
            <h2 style={h2}>5. Report</h2>
            <p style={{ marginTop: 0 }}>{result.report.rawSummary}</p>
            <Scores s={result.report.scores} />
            <ColumnList title="Themes" items={result.report.themes} />
            <ColumnList title="Pain points" items={result.report.painPoints} />
            <ColumnList title="Contradictions" items={result.report.contradictions} />
            <ColumnList title="Opportunities" items={result.report.opportunities} />
            {result.report.personaInsights?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#c5c5cc' }}>Contributor insights</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  {result.report.personaInsights.map((pi, i) => (
                    <div key={i} style={{ background: '#1a1a1f', borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, background: '#2a2a3a', color: '#7b65ff', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                          {pi.role.replace(/-/g, ' ')}
                        </span>
                        <span style={{ fontSize: 10, color: '#9a9aa3' }}>
                          {pi.sessionCount} session{pi.sessionCount !== 1 ? 's' : ''}
                          {pi.topDomains.length > 0 && ` · ${pi.topDomains.join(', ')}`}
                        </span>
                        <span style={{ fontSize: 10, color: '#9a9aa3', marginLeft: 'auto' }}>{pi.ensName}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#e8e8ea' }}>{pi.keyContribution}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p style={{ color: '#9a9aa3', marginTop: 16, fontSize: 13 }}>
              Transcript: <code style={codeStyle}>{result.transcriptPath}</code><br />
              Report on 0G: <code style={codeStyle}>{result.reportRootHash ?? 'upload skipped'}</code>
            </p>
          </section>

          {result.personaEvolutions?.length > 0 && (
            <section style={card}>
              <h2 style={h2}>6. Persona evolution</h2>
              <p style={{ color: '#9a9aa3', fontSize: 13, margin: '0 0 12px' }}>
                {result.personaEvolutions.filter((e) => e.newRootHash).length} of {result.personaEvolutions.length} personas evolved — new brain versions stored on 0G.
              </p>
              <div style={{ display: 'grid', gap: 6 }}>
                {result.personaEvolutions.map((e) => (
                  <div key={e.tokenId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <span><strong>{e.ensName}</strong> <span style={{ color: '#9a9aa3' }}>session {e.sessionCount}</span></span>
                    {e.newRootHash
                      ? <code style={{ ...codeStyle, color: '#4ade80' }}>{e.newRootHash.slice(0, 16)}…</code>
                      : <span style={{ color: '#fb923c' }}>evolution skipped</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

const ROLE_ICON: Record<string, string> = {
  'consumer': '🛒',
  'technical-skeptic': '🔬',
  'user-advocate': '🧡',
  'pm': '📋',
  'accessibility-lens': '♿',
};

function Dots() {
  return <span style={{ letterSpacing: 2 }}>···</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 13, color: '#c5c5cc', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

function Scores({ s }: { s: { ease: number; novelty: number; trust: number; relevance: number } }) {
  const items: Array<[string, number]> = [
    ['ease', s.ease], ['novelty', s.novelty], ['trust', s.trust], ['relevance', s.relevance],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, margin: '14px 0' }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ background: '#1a1a1f', padding: 10, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#9a9aa3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

function DomainBars({ domains }: { domains: Record<string, number> }) {
  const top = Object.entries(domains).filter(([, v]) => v >= 0.3).sort(([, a], [, b]) => b - a).slice(0, 4);
  if (!top.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
      {top.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9a9aa3' }}>
          <span>{k}</span>
          <div style={{ width: 36, height: 4, background: '#2a2a3a', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(v * 100)}%`, height: '100%', background: '#7b65ff', borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ColumnList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14, color: '#c5c5cc' }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((i) => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}</ul>
    </div>
  );
}

const card: React.CSSProperties = { background: '#15151a', borderRadius: 12, padding: 24, marginTop: 20, border: '1px solid #25252b' };
const personaCard: React.CSSProperties = { background: '#1a1a1f', borderRadius: 8, padding: 14 };
const h2: React.CSSProperties = { fontSize: 16, margin: '0 0 14px', color: '#9a9aa3', letterSpacing: '0.04em', textTransform: 'uppercase' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0e0e10', color: '#e8e8ea', border: '1px solid #2a2a30', borderRadius: 6, padding: '8px 10px', fontFamily: 'inherit', fontSize: 14 };
const btn: React.CSSProperties = { background: '#7b65ff', border: 'none', color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };
const codeStyle: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 };
const errStyle: React.CSSProperties = { color: '#ff5b6b', marginTop: 12 };
const hint: React.CSSProperties = { color: '#9a9aa3', marginTop: 12, fontSize: 13 };
