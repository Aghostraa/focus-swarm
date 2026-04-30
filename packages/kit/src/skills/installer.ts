import type { InstalledSkill, SkillManifest, SkillPack } from './types.js';

export function installSkillLocally(skill: SkillPack, rootHash?: string): InstalledSkill {
  return {
    name: skill.name,
    version: skill.version,
    description: skill.description,
    triggers: skill.triggers,
    rootHash,
    sourcePath: skill.sourcePath,
    installedAt: Date.now(),
    enabled: true,
  };
}

export async function uploadSkillPack(skill: SkillPack): Promise<{ rootHash: string; txHash: string }> {
  const { uploadPlain } = await import('@focus-swarm/core');
  const body = JSON.stringify(skill, null, 2);
  const uploaded = await uploadPlain(Buffer.from(body));
  return { rootHash: uploaded.rootHash, txHash: uploaded.txHash };
}

export async function uploadSkillManifest(manifest: SkillManifest): Promise<{ rootHash: string; txHash: string }> {
  const { uploadPlain } = await import('@focus-swarm/core');
  const uploaded = await uploadPlain(Buffer.from(JSON.stringify(manifest, null, 2)));
  return { rootHash: uploaded.rootHash, txHash: uploaded.txHash };
}
