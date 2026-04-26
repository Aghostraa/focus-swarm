'use client';

import { useState } from 'react';

interface SessionResult {
  sessionId: string;
  cohortId: number;
  personas: Array<{ tokenId: number; ensName: string; rootHash: string; txHash: string }>;
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
  const [market, setMarket] = useState('Gen-Z renters in Berlin who use BeReal');
  const [brief, setBrief] = useState('A subscription habit tracker that auto-snaps your habits via your phone camera.');
  const [archetypes, setArchetypes] = useState('genz-renter-berlin,solo-founder-mumbai,boomer-dad-houston');
  const [turns, setTurns] = useState(9);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetMarket: market,
          productBrief: brief,
          archetypes: archetypes.split(',').map((s) => s.trim()).filter(Boolean),
          totalTurns: turns,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as SessionResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main>
      <h1 style={{ fontSize: 28, margin: 0, letterSpacing: '-0.02em' }}>focus-swarm</h1>
      <p style={{ color: '#9a9aa3', marginTop: 6 }}>Synthetic focus groups on 0G + AXL + ENS.</p>

      <section style={card}>
        <h2 style={h2}>1. Configure session</h2>
        <Field label="Target market"><textarea value={market} onChange={(e) => setMarket(e.target.value)} style={input} rows={2} /></Field>
        <Field label="Product brief"><textarea value={brief} onChange={(e) => setBrief(e.target.value)} style={input} rows={3} /></Field>
        <Field label="Archetypes (comma-separated slugs)"><input value={archetypes} onChange={(e) => setArchetypes(e.target.value)} style={input} /></Field>
        <Field label="Total turns"><input type="number" min={4} max={30} value={turns} onChange={(e) => setTurns(Number(e.target.value))} style={input} /></Field>
        <button onClick={submit} disabled={pending} style={btn}>{pending ? 'Running…' : 'Run focus group'}</button>
        {error && <p style={{ color: '#ff5b6b', marginTop: 12 }}>Error: {error}</p>}
        {pending && <p style={{ color: '#9a9aa3', marginTop: 12 }}>This takes a couple minutes — minting personas, running the swarm, generating the report.</p>}
      </section>

      {result && (
        <>
          <section style={card}>
            <h2 style={h2}>2. Cohort minted</h2>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {result.personas.map((p) => (
                <li key={p.tokenId} style={{ marginBottom: 6 }}>
                  <strong>{p.ensName}</strong> — token {p.tokenId} · brain rootHash <code style={code}>{p.rootHash.slice(0, 14)}…</code>
                </li>
              ))}
            </ul>
          </section>

          <section style={card}>
            <h2 style={h2}>3. Report</h2>
            <p style={{ marginTop: 0 }}>{result.report.rawSummary}</p>
            <Scores s={result.report.scores} />
            <ColumnList title="Themes" items={result.report.themes} />
            <ColumnList title="Pain points" items={result.report.painPoints} />
            <ColumnList title="Contradictions" items={result.report.contradictions} />
            <ColumnList title="Opportunities" items={result.report.opportunities} />
            <p style={{ color: '#9a9aa3', marginTop: 16, fontSize: 13 }}>
              Transcript: <code style={code}>{result.transcriptPath}</code><br />
              Report: <code style={code}>{result.reportPath}</code><br />
              Report on 0G Storage: <code style={code}>{result.reportRootHash ?? 'upload skipped'}</code>
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
const h2: React.CSSProperties = { fontSize: 16, margin: '0 0 14px', color: '#9a9aa3', letterSpacing: '0.04em', textTransform: 'uppercase' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0e0e10', color: '#e8e8ea', border: '1px solid #2a2a30', borderRadius: 6, padding: '8px 10px', fontFamily: 'inherit', fontSize: 14 };
const btn: React.CSSProperties = { background: '#7b65ff', border: 'none', color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };
const code: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 };
