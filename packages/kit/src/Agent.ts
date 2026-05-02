import { createAgentBrain, type PersistentAgentBrain } from './agent/brain.js';
import { verifiedReason } from './inference/zerog.js';
import { setAgentState, getAgentState, appendIntegrationEvent } from './memory/store.js';
import {
  registerAgentEns,
  resolveAgentEns,
  agentEnsTextRecords,
} from './identity/ens.js';
import {
  sendProtocolAgentMessage,
  currentAxlPeerId,
  type ProtocolAgentMessage,
} from './transport/axl.js';
import type { InstalledSkill } from './skills/types.js';
import type { KnowledgeNote, IntegrationEvent } from './memory/types.js';

export interface CortexManifest {
  name: string;
  ensName?: string;
  protocol?: string;
  mission: string;
  skills?: InstalledSkill[];
  knowledge?: KnowledgeNote[];
  boundaries?: string[];
  visibility: 'private' | 'public';
}

export class Agent {
  readonly brain: PersistentAgentBrain;
  readonly manifest: CortexManifest;
  private axlApiUrl?: string;

  private constructor(brain: PersistentAgentBrain, manifest: CortexManifest, axlApiUrl?: string) {
    this.brain = brain;
    this.manifest = manifest;
    this.axlApiUrl = axlApiUrl;
  }

  static async create(
    manifest: CortexManifest,
    opts: { aesKey?: Buffer; axlApiUrl?: string } = {},
  ): Promise<Agent> {
    const { uploadEncrypted, uploadPlain } = await import('@cortex/core');

    const brain = createAgentBrain({
      name: manifest.name,
      ensName: manifest.ensName,
      protocol: manifest.protocol,
      mission: manifest.mission,
      boundaries: manifest.boundaries,
      skills: manifest.skills,
    });

    if (manifest.knowledge?.length) {
      brain.memory.semantic.push(...manifest.knowledge);
    }

    const brainBytes = Buffer.from(JSON.stringify(brain), 'utf8');
    let rootHash: string;
    let aesKey = opts.aesKey;

    if (manifest.visibility === 'private') {
      if (!aesKey) aesKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
      const result = await uploadEncrypted(brainBytes, aesKey);
      rootHash = result.rootHash;
    } else {
      const result = await uploadPlain(brainBytes);
      rootHash = result.rootHash;
    }

    brain.integrations.brainRootHash = rootHash;

    const axlPeerId = opts.axlApiUrl ? await currentAxlPeerId(opts.axlApiUrl).catch(() => undefined) : undefined;
    if (axlPeerId) brain.integrations.axlPeerId = axlPeerId;

    if (manifest.ensName) {
      await registerAgentEns({
        ensName: manifest.ensName,
        texts: agentEnsTextRecords({
          protocol: manifest.protocol,
          axlPeerId,
          brainRootHash: rootHash,
        }),
      });
    }

    return new Agent(brain, manifest, opts.axlApiUrl);
  }

  static async load(
    ensName: string,
    opts: { aesKey?: Buffer | null; axlApiUrl?: string } = {},
  ): Promise<Agent> {
    const { downloadEncrypted, downloadPlain } = await import('@cortex/core') as any;
    const { downloadDecrypted } = await import('@cortex/core');

    const record = await resolveAgentEns(ensName);
    const resume = record.texts['agent.resume'];
    if (!resume) throw new Error(`no agent.resume text record for ${ensName}`);

    const rootHash = resume.replace(/^0g:\/\//, '');
    let brainBytes: Buffer;

    if (opts.aesKey) {
      brainBytes = await downloadDecrypted(rootHash, opts.aesKey);
    } else if (opts.aesKey === null) {
      const { downloadPlain: dl } = await import('@cortex/core');
      brainBytes = await dl(rootHash);
    } else {
      // try plain first, then fail clearly
      const { downloadPlain: dl } = await import('@cortex/core');
      brainBytes = await dl(rootHash);
    }

    const brain = JSON.parse(brainBytes.toString('utf8')) as PersistentAgentBrain;

    const manifest: CortexManifest = {
      name: brain.identity.name,
      ensName: brain.identity.ensName,
      protocol: brain.identity.protocol,
      mission: brain.identity.mission,
      skills: brain.skills,
      boundaries: brain.identity.boundaries,
      visibility: opts.aesKey ? 'private' : 'public',
    };

    const axlPeerId = record.texts['agent.axl_peer'];
    if (axlPeerId) brain.integrations.axlPeerId = axlPeerId;

    return new Agent(brain, manifest, opts.axlApiUrl);
  }

  async ask(question: string): Promise<{ text: string; verified: boolean }> {
    const result = await verifiedReason([
      { role: 'system', content: this.brain.identity.mission },
      { role: 'user', content: question },
    ]);
    return { text: result.text, verified: result.verified };
  }

  async remember(key: string, value: unknown): Promise<void> {
    await setAgentState(this.brain.identity.name, key, value);
  }

  async recall<T>(key: string): Promise<T | null> {
    return getAgentState<T>(this.brain.identity.name, key);
  }

  async appendEpisode(entry: Omit<IntegrationEvent, 'id' | 'timestamp'>): Promise<void> {
    await appendIntegrationEvent(this.brain.identity.name, entry);
  }

  async send(target: string, message: ProtocolAgentMessage): Promise<void> {
    if (!this.axlApiUrl) throw new Error('axlApiUrl not set');
    const record = await resolveAgentEns(target);
    const peerId = record.texts['agent.axl_peer'];
    if (!peerId) throw new Error(`no agent.axl_peer for ${target}`);
    await sendProtocolAgentMessage(this.axlApiUrl, peerId, message);
  }

  listen(
    onMessage: (msg: ProtocolAgentMessage, from: string) => Promise<void>,
  ): () => void {
    if (!this.axlApiUrl) throw new Error('axlApiUrl not set');
    const controller = new AbortController();
    const apiUrl = this.axlApiUrl;
    // fire-and-forget; errors logged internally by pumpRecv
    (async () => {
      const { AxlClient, pumpRecv } = await import('@cortex/core');
      const axl = new AxlClient(apiUrl);
      await pumpRecv(axl, (msg: any, from: string) => onMessage(msg as ProtocolAgentMessage, from), controller.signal);
    })();
    return () => controller.abort();
  }

  async save(opts: { aesKey?: Buffer } = {}): Promise<{ rootHash: string }> {
    const { uploadEncrypted, uploadPlain } = await import('@cortex/core');
    this.brain.updatedAt = Date.now();
    const brainBytes = Buffer.from(JSON.stringify(this.brain), 'utf8');

    let rootHash: string;
    if (this.manifest.visibility === 'private') {
      if (!opts.aesKey) throw new Error('aesKey required for private agent save');
      const result = await uploadEncrypted(brainBytes, opts.aesKey);
      rootHash = result.rootHash;
    } else {
      const result = await uploadPlain(brainBytes);
      rootHash = result.rootHash;
    }

    this.brain.integrations.brainRootHash = rootHash;

    if (this.manifest.ensName) {
      await registerAgentEns({
        ensName: this.manifest.ensName,
        texts: agentEnsTextRecords({
          protocol: this.manifest.protocol,
          axlPeerId: this.brain.integrations.axlPeerId,
          brainRootHash: rootHash,
        }),
      });
    }

    return { rootHash };
  }
}
