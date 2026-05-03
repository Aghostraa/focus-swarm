'use client';

import { useEffect, useMemo, useState } from 'react';

type Probe<T = any> = { ok: boolean; data?: T; error?: string; ms: number };

type TwinStatus = {
  key: string;
  name: string;
  ensName: string;
  protocol: string;
  httpUrl: string;
  axlUrl: string;
  capabilities: Probe;
  evolution: Probe;
  topology: Probe;
  ens: Probe<{ texts?: Record<string, string> }>;
};

type StatusPayload = {
  checkedAt: string;
  ensGateway: { url: string; personas: Probe<any[]> };
  twins: TwinStatus[];
  artifacts: {
    protocolDemo: any | null;
    protocolManifest: any | null;
    persistentManifest: any | null;
    latestFocusReport: any | null;
  };
};

type AskPayload = {
  checkedAt: string;
  results: Array<{
    ok: boolean;
    name: string;
    protocol: string;
    question: string;
    data?: { answer?: string; verified?: boolean; skill?: string; from?: string };
    error?: string;
    ms: number;
  }>;
};

type ProjectPayload = {
  checkedAt: string;
  projectId: string;
  description: string;
  declarations: Array<{ ok: boolean; name: string; protocol: string; data?: any; error?: string; ms: number }>;
  sessions: Array<{ ok: boolean; name: string; protocol: string; data?: any; error?: string; ms: number }>;
};

type LiveSessionPayload = {
  checkedAt: string;
  projectId: string;
  sessions: Array<{ ok: boolean; name: string; protocol: string; data?: any; error?: string; ms: number }>;
  evolutions: Array<{ ok: boolean; name: string; protocol: string; data?: any; error?: string; ms: number }>;
};

const liveQuestion = 'Show how a Cortex protocol buddy discovers peers, verifies inference, and updates memory after a failed integration.';
const projectDescription = 'Build a protocol buddy that stores its brain on 0G, verifies every answer with TeeML, discovers peers via ENS text records, and coordinates integration plans over AXL.';
const ogExplorer = 'https://explorer.0g.ai/testnet/home';
const inftContractAddress = '0x1f45c631456f55da565fcb5e8e063a0dd4b6380b';
const inftContractUrl = 'https://explorer.0g.ai/testnet/blockchain/accounts/0x1f45c631456f55da565fcb5e8e063a0dd4b6380b/transactions';
const offchainResolverAddress = '0xab32d4b316be27ce47fcbf92a321f24b22c49121';
const offchainResolverUrl = 'https://explorer.0g.ai/testnet/blockchain/accounts/0xab32d4b316be27ce47fcbf92a321f24b22c49121/transactions';
const knownMintTx = '0x06482bfd93b50bd7ec5e2b1cb95c0de759ea4d68c9dac6c8fee0497eea7fde1b';
const knownMintTxUrl = 'https://explorer.0g.ai/testnet/blockchain/txns/0x06482bfd93b50bd7ec5e2b1cb95c0de759ea4d68c9dac6c8fee0497eea7fde1b/overview';
const ensGateway = 'http://127.0.0.1:8787';
const brainStorageSubmissions: Record<string, number> = {
  '0xd848987575b432d37bcdacc7daee75087946a0309ca250013d950d361899ae15': 74270,
};

export default function ProtocolTwinsPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [ask, setAsk] = useState<AskPayload | null>(null);
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [idea, setIdea] = useState(projectDescription);
  const [liveProjectId, setLiveProjectId] = useState<string | null>(null);
  const [liveSession, setLiveSession] = useState<LiveSessionPayload | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    setLoadingStatus(true);
    setError(null);
    try {
      const res = await fetch('/api/cortex-demo/status', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingStatus(false);
    }
  }

  async function runAsk() {
    setLoadingAsk(true);
    setAsk(null);
    setError(null);
    try {
      const res = await fetch('/api/cortex-demo/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: liveQuestion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAsk(data);
      await refreshStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingAsk(false);
    }
  }

  async function runProject() {
    setLoadingProject(true);
    setProject(null);
    setLiveSession(null);
    setLiveProjectId(null);
    setError(null);
    const projectId = `ui-${Date.now().toString(36)}`;
    try {
      const res = await fetch('/api/cortex-demo/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, description: idea, waitMs: 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setProject(data);
      setLiveProjectId(data.projectId);
      await refreshStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingProject(false);
    }
  }

  async function refreshLiveSession(projectId = liveProjectId) {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/cortex-demo/session/${encodeURIComponent(projectId)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLiveSession(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refreshStatus();
    const id = window.setInterval(refreshStatus, 7000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!liveProjectId) return;
    refreshLiveSession(liveProjectId);
    const id = window.setInterval(() => {
      refreshLiveSession(liveProjectId);
      refreshStatus();
    }, 1800);
    return () => window.clearInterval(id);
  }, [liveProjectId]);

  const totals = useMemo(() => {
    const twins = status?.twins ?? [];
    return {
      http: twins.filter((t) => t.capabilities.ok).length,
      axl: twins.filter((t) => t.topology.ok).length,
      ens: twins.filter((t) => t.ens.ok).length,
      verified: ask?.results.filter((r) => r.data?.verified).length ?? 0,
    };
  }, [status, ask]);

  return (
    <main>
      <header style={header}>
        <div>
          <p style={eyebrow}>Cortex live protocol-twins demo</p>
          <h1 style={h1}>Connections, verification, identity, and memory updates</h1>
          <p style={subtle}>
            This page calls the actual local Cortex services: protocol twin HTTP ports, AXL node bridges,
            ENS gateway lookups, TeeML-verified ask endpoints, and repo proof/session artifacts.
          </p>
        </div>
        <div style={buttonRow}>
          <a href={inftContractUrl} target="_blank" rel="noreferrer" style={linkButton}>
            iNFT contract
          </a>
          <a href={offchainResolverUrl} target="_blank" rel="noreferrer" style={linkButton}>
            resolver
          </a>
          <button onClick={refreshStatus} disabled={loadingStatus} style={secondaryButton}>
            {loadingStatus ? 'Refreshing' : 'Refresh'}
          </button>
          <button onClick={runAsk} disabled={loadingAsk} style={primaryButton}>
            {loadingAsk ? 'Asking twins' : 'Live verified ask'}
          </button>
          <button onClick={runProject} disabled={loadingProject} style={primaryButton}>
            {loadingProject ? 'Negotiating' : 'Run AXL project'}
          </button>
        </div>
      </header>

      {error && <div style={errorBox}>{error}</div>}

      <section style={metricGrid}>
        <Metric label="Twin HTTP APIs" value={`${totals.http}/3`} tone={totals.http === 3 ? 'good' : 'warn'} />
        <Metric label="AXL nodes" value={`${totals.axl}/3`} tone={totals.axl === 3 ? 'good' : 'warn'} />
        <Metric label="ENS records" value={`${totals.ens}/3`} tone={totals.ens === 3 ? 'good' : 'warn'} />
        <Metric label="Verified answers" value={`${totals.verified}/3`} tone={totals.verified === 3 ? 'good' : 'idle'} />
      </section>

      <section style={section}>
        <div style={sectionHead}>
          <div>
            <h2 style={h2}>Protocol Twins</h2>
            <p style={subtleSmall}>Live health from `/capabilities`, `/evolution-status`, AXL `/topology`, and ENS `/lookup/:name`.</p>
          </div>
          <span style={timestamp}>{status ? `checked ${new Date(status.checkedAt).toLocaleTimeString()}` : 'waiting'}</span>
        </div>
        <div style={twinGrid}>
          {(status?.twins ?? []).map((twin) => (
            <TwinCard
              key={twin.name}
              twin={twin}
              mintRecord={(status?.artifacts.protocolManifest as any)?.twins?.find((t: any) => t.ensName === twin.ensName)}
            />
          ))}
          {!status && [0, 1, 2].map((n) => <div key={n} style={emptyCard}>Loading live service status...</div>)}
        </div>
      </section>

      <section style={section}>
        <h2 style={h2}>Live TeeML Verification</h2>
        <p style={subtleSmall}>Button calls `/ask` on all three twin processes. Green means the twin returned `verified: true` from 0G Compute.</p>
        {ask ? (
          <div style={resultGrid}>
            {ask.results.map((r) => (
              <div key={r.name} style={resultCard}>
                <div style={cardTopline}>
                  <strong>{r.name}</strong>
                  <StatusPill ok={!!r.data?.verified} label={r.data?.verified ? 'TeeML verified' : r.ok ? 'unverified' : 'offline'} />
                </div>
                <p style={answerText}>{r.data?.answer ?? r.error ?? 'No answer returned.'}</p>
                <div style={metaLine}>skill: {r.data?.skill || 'none'} | {r.ms}ms</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={emptyWide}>Run “Live verified ask” to produce real responses from the running twins.</div>
        )}
      </section>

      <section style={section}>
        <h2 style={h2}>Live AXL Discussion</h2>
        <p style={subtleSmall}>
          Enter an idea, then start the protocol twins. Each twin declares its role, resolves peer ENS names, sends
          `peer_query` messages over AXL, and exposes the growing transcript through `/session/:projectId`.
        </p>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={4}
          style={ideaInput}
          placeholder="Describe the product, protocol integration, or app idea the twins should discuss."
        />
        <div style={buttonRow}>
          <button onClick={runProject} disabled={loadingProject || !idea.trim()} style={primaryButton}>
            {loadingProject ? 'Starting discussion' : 'Start live discussion'}
          </button>
          {liveProjectId && (
            <button onClick={() => refreshLiveSession()} style={secondaryButton}>
              Poll now
            </button>
          )}
        </div>
        {project ? (
          <ProjectView project={project} liveSession={liveSession} />
        ) : (
          <div style={emptyWide}>Start a live discussion to watch AXL peer exchanges and evolution counters update.</div>
        )}
      </section>

      <section style={section}>
        <h2 style={h2}>Origin Story: Focus Group Pivot</h2>
        <div style={timeline}>
          <TimelineItem title="First integration" text="The original app minted rich NPC-derived personas with life stories, memories, motivations, and traumatic backstory context. The goal was a marketplace where trained personas could later be rented." />
          <TimelineItem title="AXL cohort discussion" text="Separate persona processes talked through AXL node pub/sub style flows in moderated focus-group cohorts. Their transcripts and reports live under the repo's deploy reports." />
          <TimelineItem title="Invalidation" text="That cohort pushed back on the marketplace idea as not useful enough by itself, so the project pivoted from rentable NPC personas into practical protocol buddies." />
          <TimelineItem title="Current Cortex" text="The same primitives now power persistent protocol twins for 0G, AXL, and ENS: discoverable identities, verified answers, peer negotiation, and memory updates from integration failures." />
        </div>
        <ArtifactSummary status={status} />
      </section>
    </main>
  );
}

function TwinCard({ twin, mintRecord }: { twin: TwinStatus; mintRecord?: any }) {
  const texts = twin.ens.data?.texts ?? {};
  const topology: any = twin.topology.data ?? {};
  const evolution: any = twin.evolution.data ?? {};
  const caps: any = twin.capabilities.data ?? {};
  const inftValue = texts['agent.inft'] || (mintRecord?.tokenId !== undefined ? `${inftContractAddress}:${mintRecord.tokenId}` : undefined);
  return (
    <article style={twinCard}>
      <div style={cardTopline}>
        <div>
          <h3 style={h3}>{twin.name}</h3>
          <div style={metaLine}>{twin.protocol} | {twin.ensName}</div>
        </div>
        <StatusPill ok={twin.capabilities.ok && twin.topology.ok && twin.ens.ok} label={twin.capabilities.ok ? 'live' : 'offline'} />
      </div>
      <div style={checkList}>
        <Check label="HTTP twin" probe={twin.capabilities} detail={caps.skills?.join(', ') || twin.httpUrl} />
        <Check label="AXL topology" probe={twin.topology} detail={topology.our_public_key ? `${String(topology.our_public_key).slice(0, 18)}...` : twin.axlUrl} />
        <Check label="ENS lookup" probe={twin.ens} detail={texts['agent.axl_peer'] ? `${texts['agent.axl_peer'].slice(0, 18)}...` : 'agent.axl_peer'} />
        <Check label="Evolution state" probe={twin.evolution} detail={`events: ${evolution.interactionCount ?? 0}, skills: ${evolution.skillsLoaded ?? 0}`} />
      </div>
      <div style={recordBox}>
        <RecordLine k="agent.resume" v={texts['agent.resume'] || (mintRecord?.brainRootHash ? `0g://${mintRecord.brainRootHash}` : undefined)} href={brainLink(mintRecord?.brainRootHash)} />
        <RecordLine k="agent.inft" v={inftValue} href={inftContractUrl} />
        <RecordLine k="agent.axl_peer" v={texts['agent.axl_peer']} href={`${twin.axlUrl}/topology`} />
        <RecordLine k="agent.protocol" v={texts['agent.protocol']} />
      </div>
      <div style={proofLinks}>
        <a href={`/api/cortex-demo/status`} target="_blank" rel="noreferrer" style={proofLink}>UI status JSON</a>
        <a href={`${ensGateway}/lookup/${encodeURIComponent(twin.ensName)}`} target="_blank" rel="noreferrer" style={proofLink}>ENS text records</a>
        <a href={`${twin.httpUrl}/capabilities`} target="_blank" rel="noreferrer" style={proofLink}>Twin runtime</a>
        <a href={`${twin.axlUrl}/topology`} target="_blank" rel="noreferrer" style={proofLink}>AXL topology</a>
        <a href={txLink(mintRecord?.txHash)} target="_blank" rel="noreferrer" style={proofLink}>0G mint tx</a>
        <a href={offchainResolverUrl} target="_blank" rel="noreferrer" style={proofLink}>OffchainResolver</a>
      </div>
      {mintRecord && (
        <div style={mintProofBox}>
          <div style={recordLine}>
            <span style={recordKey}>tokenId</span>
            <code style={code}>{String(mintRecord.tokenId ?? 'pending')}</code>
          </div>
          <div style={recordLine}>
            <span style={recordKey}>mint tx</span>
            <a href={txLink(mintRecord.txHash)} target="_blank" rel="noreferrer" style={codeLink}>{compact(mintRecord.txHash || 'pending')}</a>
          </div>
          <div style={recordLine}>
            <span style={recordKey}>brain root</span>
            <a href={brainLink(mintRecord.brainRootHash)} target="_blank" rel="noreferrer" style={codeLink}>{compact(mintRecord.brainRootHash || 'pending')}</a>
          </div>
          <div style={recordLine}>
            <span style={recordKey}>storage seq</span>
            <a href={brainLink(mintRecord.brainRootHash)} target="_blank" rel="noreferrer" style={codeLink}>
              {storageSeqLabel(mintRecord.brainRootHash)}
            </a>
          </div>
        </div>
      )}
    </article>
  );
}

function Check({ label, probe, detail }: { label: string; probe: Probe; detail: string }) {
  return (
    <div style={checkRow}>
      <span style={probe.ok ? dotGood : dotBad} />
      <span style={{ minWidth: 110 }}>{label}</span>
      <span style={mutedText}>{probe.ok ? detail : probe.error || 'not reachable'}</span>
    </div>
  );
}

function RecordLine({ k, v, href }: { k: string; v?: string; href?: string }) {
  return (
    <div style={recordLine}>
      <span style={recordKey}>{k}</span>
      {href && v ? (
        <a href={href} target="_blank" rel="noreferrer" style={codeLink}>{compact(v)}</a>
      ) : (
        <code style={code}>{v ? compact(v) : 'not set'}</code>
      )}
    </div>
  );
}

function ProjectView({ project, liveSession }: { project: ProjectPayload; liveSession: LiveSessionPayload | null }) {
  const sessions = liveSession?.sessions ?? project.sessions;
  const exchanges = sessions.flatMap((s) => s.data?.peerExchanges ?? []);
  const evolutions = liveSession?.evolutions ?? [];
  return (
    <div>
      <div style={projectBox}>
        <strong>{project.projectId}</strong>
        <p style={{ ...subtleSmall, marginBottom: 0 }}>{project.description}</p>
      </div>
      <div style={resultGrid}>
        {project.declarations.map((d) => (
          <div key={d.name} style={resultCard}>
            <div style={cardTopline}>
              <strong>{d.name}</strong>
              <StatusPill ok={d.ok && d.data?.verified} label={d.data?.verified ? 'verified role' : d.ok ? 'declared' : 'offline'} />
            </div>
            <p style={answerText}>{d.data?.role || d.error || 'No declaration returned.'}</p>
            <div style={metaLine}>provides: {(d.data?.provides ?? []).join(', ') || 'none'}</div>
          </div>
        ))}
      </div>
      <div style={liveGrid}>
        {evolutions.map((e) => (
          <div key={e.name} style={evolutionCard}>
            <div style={cardTopline}>
              <strong>{e.name}</strong>
              <StatusPill ok={e.ok} label={e.ok ? 'tracking' : 'offline'} />
            </div>
            <div style={evolutionNumbers}>
              <span>
                <strong>{e.data?.interactionCount ?? 0}</strong>
                <small> interactions</small>
              </span>
              <span>
                <strong>{e.data?.skillsLoaded ?? 0}</strong>
                <small> skills</small>
              </span>
              <span>
                <strong>{e.data?.isEvolving ? 'yes' : 'no'}</strong>
                <small> evolving</small>
              </span>
            </div>
          </div>
        ))}
        {!evolutions.length && (
          <div style={emptyWide}>Evolution counters will appear after the first session poll.</div>
        )}
      </div>
      <h3 style={h3}>Peer exchanges over AXL</h3>
      <div style={metaLine}>
        {liveSession ? `last poll ${new Date(liveSession.checkedAt).toLocaleTimeString()}` : 'waiting for first poll'}
      </div>
      {exchanges.length ? (
        <div style={exchangeList}>
          {exchanges.map((x: any, i: number) => (
            <div key={i} style={exchangeRow}>
              <div style={metaLine}>{`${x.from} -> ${x.to} | skill ${x.skill || 'none'} | verified ${String(x.verified)}`}</div>
              <p style={answerText}>{x.answer}</p>
            </div>
          ))}
        </div>
      ) : (
        <div style={emptyWide}>No peer exchanges collected yet. Confirm ENS gateway and all AXL nodes are running.</div>
      )}
    </div>
  );
}

function ArtifactSummary({ status }: { status: StatusPayload | null }) {
  const focusReport = status?.artifacts.latestFocusReport as any;
  const protocolDemo = status?.artifacts.protocolDemo as any;
  const protocolManifest = status?.artifacts.protocolManifest as any;
  return (
    <div style={artifactGrid}>
      <div style={artifactCard}>
        <strong>Latest focus report</strong>
        <p style={subtleSmall}>{focusReport?.report?.rawSummary || focusReport?.rawSummary || 'No focus report artifact found.'}</p>
      </div>
      <div style={artifactCard}>
        <strong>Latest protocol proof</strong>
        <p style={subtleSmall}>
          {protocolDemo?.proofRootHash ? `0G proof root: ${compact(protocolDemo.proofRootHash)}` : 'No uploaded proof root in latest-demo.json.'}
        </p>
      </div>
      <div style={artifactCard}>
        <strong>Minted protocol twins</strong>
        <div style={mintList}>
          {(protocolManifest?.twins ?? []).map((t: any) => (
            <a key={t.txHash || t.ensName} href={txLink(t.txHash)} target="_blank" rel="noreferrer" style={mintLink}>
              <span>{t.name} token {t.tokenId ?? 'pending'}</span>
              <code style={code}>{t.txHash ? compact(t.txHash) : compact(t.brainRootHash || 'no hash')}</code>
            </a>
          ))}
          {!protocolManifest?.twins?.length && <p style={subtleSmall}>No protocol-twins manifest found.</p>}
        </div>
      </div>
      <div style={artifactCard}>
        <strong>Explorer targets</strong>
        <p style={subtleSmall}>
          On-chain mint transactions, the deployed iNFT contract, and the OffchainResolver account can be checked in the live 0G explorer.
        </p>
        <div style={mintList}>
          <a href={inftContractUrl} target="_blank" rel="noreferrer" style={inlineLink}>iNFT contract {compact(inftContractAddress)}</a>
          <a href={offchainResolverUrl} target="_blank" rel="noreferrer" style={inlineLink}>OffchainResolver {compact(offchainResolverAddress)}</a>
          <a href={knownMintTxUrl} target="_blank" rel="noreferrer" style={inlineLink}>Known mint tx {compact(knownMintTx)}</a>
          <a href={ogExplorer} target="_blank" rel="noreferrer" style={inlineLink}>Open 0G testnet explorer home</a>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'idle' }) {
  return (
    <div style={metricCard}>
      <div style={metricValue(tone)}>{value}</div>
      <div style={metricLabel}>{label}</div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span style={ok ? pillGood : pillBad}>{label}</span>;
}

function TimelineItem({ title, text }: { title: string; text: string }) {
  return (
    <div style={timelineItem}>
      <div style={timelineMarker} />
      <div>
        <strong>{title}</strong>
        <p style={{ ...subtleSmall, margin: '4px 0 0' }}>{text}</p>
      </div>
    </div>
  );
}

function compact(value: string) {
  return value.length > 34 ? `${value.slice(0, 18)}...${value.slice(-10)}` : value;
}

function explorerLink(value?: string) {
  if (!value) return ogExplorer;
  return `${ogExplorer}?search=${encodeURIComponent(value)}`;
}

function txLink(txHash?: string) {
  if (!txHash) return knownMintTxUrl;
  return `https://explorer.0g.ai/testnet/blockchain/txns/${txHash}/overview`;
}

function brainLink(rootHash?: string) {
  if (!rootHash) return ogExplorer;
  const seq = brainStorageSubmissions[rootHash.toLowerCase()];
  if (seq) return `https://explorer.0g.ai/testnet/storage/submissions/${seq}`;
  return explorerLink(rootHash);
}

function storageSeqLabel(rootHash?: string) {
  if (!rootHash) return 'pending';
  return brainStorageSubmissions[rootHash.toLowerCase()]?.toString() ?? 'sequence unknown';
}

const header: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr', gap: 18, marginBottom: 18 };
const eyebrow: React.CSSProperties = { color: '#71d6a2', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0, margin: 0 };
const h1: React.CSSProperties = { fontSize: 34, lineHeight: 1.05, margin: '6px 0 10px', letterSpacing: 0 };
const h2: React.CSSProperties = { fontSize: 18, margin: 0, letterSpacing: 0 };
const h3: React.CSSProperties = { fontSize: 14, margin: 0, letterSpacing: 0 };
const subtle: React.CSSProperties = { color: '#b6b8c5', lineHeight: 1.55, margin: 0 };
const subtleSmall: React.CSSProperties = { color: '#9da1ad', lineHeight: 1.5, fontSize: 13, margin: '5px 0 0' };
const buttonRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 10 };
const primaryButton: React.CSSProperties = { background: '#2f8f6b', color: '#fff', border: 0, borderRadius: 6, padding: '10px 14px', fontWeight: 700, cursor: 'pointer' };
const secondaryButton: React.CSSProperties = { background: '#242833', color: '#e8e8ea', border: '1px solid #3b4150', borderRadius: 6, padding: '10px 14px', fontWeight: 700, cursor: 'pointer' };
const linkButton: React.CSSProperties = { background: '#0b0d12', color: '#71d6a2', border: '1px solid #2f8f6b', borderRadius: 6, padding: '10px 14px', fontWeight: 700, textDecoration: 'none' };
const ideaInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', margin: '14px 0 12px', background: '#0b0d12', color: '#e8e8ea', border: '1px solid #353b49', borderRadius: 6, padding: 12, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.45, resize: 'vertical' };
const section: React.CSSProperties = { background: '#151821', border: '1px solid #282e3a', borderRadius: 8, padding: 18, marginTop: 14 };
const sectionHead: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 };
const timestamp: React.CSSProperties = { color: '#858b99', fontSize: 12, whiteSpace: 'nowrap' };
const metricGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 };
const metricCard: React.CSSProperties = { background: '#151821', border: '1px solid #282e3a', borderRadius: 8, padding: 14 };
const metricValue = (tone: 'good' | 'warn' | 'idle'): React.CSSProperties => ({ color: tone === 'good' ? '#71d6a2' : tone === 'warn' ? '#f4be63' : '#b6b8c5', fontSize: 28, fontWeight: 800 });
const metricLabel: React.CSSProperties = { color: '#9da1ad', fontSize: 12, marginTop: 4 };
const twinGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 };
const twinCard: React.CSSProperties = { background: '#10131a', border: '1px solid #282e3a', borderRadius: 8, padding: 14, minWidth: 0 };
const emptyCard: React.CSSProperties = { ...twinCard, color: '#9da1ad', minHeight: 180 };
const cardTopline: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 12 };
const metaLine: React.CSSProperties = { color: '#858b99', fontSize: 12, lineHeight: 1.45 };
const checkList: React.CSSProperties = { display: 'grid', gap: 8 };
const checkRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '12px 104px 1fr', gap: 8, alignItems: 'center', fontSize: 12, minWidth: 0 };
const dotGood: React.CSSProperties = { width: 8, height: 8, borderRadius: 10, background: '#71d6a2' };
const dotBad: React.CSSProperties = { width: 8, height: 8, borderRadius: 10, background: '#ef6b73' };
const mutedText: React.CSSProperties = { color: '#9da1ad', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const recordBox: React.CSSProperties = { background: '#0b0d12', borderRadius: 6, padding: 10, marginTop: 12, display: 'grid', gap: 6 };
const recordLine: React.CSSProperties = { display: 'grid', gridTemplateColumns: '92px 1fr', gap: 8, minWidth: 0 };
const recordKey: React.CSSProperties = { color: '#858b99', fontSize: 11 };
const code: React.CSSProperties = { color: '#cfd3df', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const codeLink: React.CSSProperties = { ...code, color: '#71d6a2', textDecoration: 'none' };
const proofLinks: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 };
const proofLink: React.CSSProperties = { color: '#71d6a2', background: '#0b0d12', border: '1px solid #243d35', borderRadius: 6, padding: '7px 8px', textDecoration: 'none', fontSize: 12, textAlign: 'center' };
const mintProofBox: React.CSSProperties = { background: '#0b0d12', border: '1px solid #243d35', borderRadius: 6, padding: 10, marginTop: 10, display: 'grid', gap: 6 };
const pillGood: React.CSSProperties = { color: '#07120c', background: '#71d6a2', borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' };
const pillBad: React.CSSProperties = { color: '#fff', background: '#7a2b35', borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' };
const resultGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 14 };
const resultCard: React.CSSProperties = { background: '#10131a', border: '1px solid #282e3a', borderRadius: 8, padding: 14, minWidth: 0 };
const answerText: React.CSSProperties = { color: '#dfe3ed', lineHeight: 1.5, fontSize: 13, margin: '0 0 10px', maxHeight: 180, overflow: 'auto' };
const emptyWide: React.CSSProperties = { color: '#9da1ad', background: '#10131a', border: '1px dashed #353b49', borderRadius: 8, padding: 16, marginTop: 12 };
const projectBox: React.CSSProperties = { background: '#0b0d12', borderRadius: 8, padding: 12, marginTop: 12 };
const liveGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, margin: '14px 0' };
const evolutionCard: React.CSSProperties = { background: '#10131a', border: '1px solid #282e3a', borderRadius: 8, padding: 12, minWidth: 0 };
const evolutionNumbers: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, color: '#dfe3ed', fontSize: 13 };
const exchangeList: React.CSSProperties = { display: 'grid', gap: 8, marginTop: 8 };
const exchangeRow: React.CSSProperties = { background: '#10131a', border: '1px solid #282e3a', borderRadius: 8, padding: 12 };
const timeline: React.CSSProperties = { display: 'grid', gap: 12, marginTop: 14 };
const timelineItem: React.CSSProperties = { display: 'grid', gridTemplateColumns: '16px 1fr', gap: 10 };
const timelineMarker: React.CSSProperties = { width: 10, height: 10, borderRadius: 10, background: '#71d6a2', marginTop: 4 };
const artifactGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 };
const artifactCard: React.CSSProperties = { background: '#10131a', border: '1px solid #282e3a', borderRadius: 8, padding: 14 };
const mintList: React.CSSProperties = { display: 'grid', gap: 8, marginTop: 10 };
const mintLink: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr minmax(140px, 220px)', gap: 10, alignItems: 'center', color: '#dfe3ed', textDecoration: 'none', fontSize: 13 };
const inlineLink: React.CSSProperties = { color: '#71d6a2', textDecoration: 'none', fontSize: 13, fontWeight: 700 };
const errorBox: React.CSSProperties = { background: '#351820', border: '1px solid #7a2b35', color: '#ffd4d8', borderRadius: 8, padding: 12, marginBottom: 14 };
