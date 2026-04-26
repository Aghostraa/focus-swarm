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
  };
}

export default function Home() {
  // Proposal form
  const [market, setMarket] = useState('Gen-Z renters in Berlin who use BeReal');
  const [brief, setBrief] = useState('A subscription habit tracker that auto-snaps your habits via your phone camera.');
  const [goals, setGoals] = useState('Understand checkout anxiety\nFind willingness-to-pay signals');
  const [style, setStyle] = useState<'breadth' | 'deep-dive' | 'conflict-seeking'>('breadth');

  // Awaken state
  const [awakening, setAwakening] = useState(false);
  const [awakenError, setAwakenError] = useState<string | null>(null);
  const [awakenResults, setAwakenResults] = useState<AwakenResult[] | null>(null);
  const [selectedReuse, setSelectedReuse] = useState<Set<number>>(new Set());

  // Session builder
  const [archetypes, setArchetypes] = useState('genz-renter-berlin,solo-founder-mumbai');
  const [turns, setTurns] = useState(9);

  // Session state
  const [running, setRunning] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);

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
    setRunning(true);
    setSessionError(null);
    setResult(null);
    try {
      const reusePersonas = (awakenResults ?? [])
        .filter((r) => selectedReuse.has(r.tokenId))
        .map((r) => ({ tokenId: r.tokenId, ensName: r.ensName, rootHash: r.rootHash, keyPath: r.keyPath }));

      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetMarket: market,
          productBrief: brief,
          archetypes: archetypes.split(',').map((s) => s.trim()).filter(Boolean),
          reusePersonas,
          totalTurns: turns,
          moderatorConfig: {
            researchGoals: goals.split('\n').map((s) => s.trim()).filter(Boolean),
            style,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as SessionResult);
    } catch (e) {
      setSessionError((e as Error).message);
    } finally {
      setRunning(false);
    }
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
                        <div>
                          <strong style={{ fontSize: 13 }}>{r.archetype}</strong>
                          <span style={{ color: '#9a9aa3', fontSize: 11, marginLeft: 8 }}>{r.ensName}</span>
                        </div>
                        <div style={{
                          width: 18, height: 18, borderRadius: 4,
                          background: selected ? '#7b65ff' : 'transparent',
                          border: '2px solid ' + (selected ? '#7b65ff' : '#3a3a42'),
                          flexShrink: 0,
                        }} />
                      </div>
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
          <Field label="Total turns">
            <input type="number" min={4} max={30} value={turns} onChange={(e) => setTurns(Number(e.target.value))} style={input} />
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

      {/* Panel C — Results */}
      {result && (
        <>
          <section style={card}>
            <h2 style={h2}>3. Cohort</h2>
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
            <h2 style={h2}>4. Report</h2>
            <p style={{ marginTop: 0 }}>{result.report.rawSummary}</p>
            <Scores s={result.report.scores} />
            <ColumnList title="Themes" items={result.report.themes} />
            <ColumnList title="Pain points" items={result.report.painPoints} />
            <ColumnList title="Contradictions" items={result.report.contradictions} />
            <ColumnList title="Opportunities" items={result.report.opportunities} />
            <p style={{ color: '#9a9aa3', marginTop: 16, fontSize: 13 }}>
              Transcript: <code style={codeStyle}>{result.transcriptPath}</code><br />
              Report on 0G: <code style={codeStyle}>{result.reportRootHash ?? 'upload skipped'}</code>
            </p>
          </section>
        </>
      )}
    </main>
  );
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
