// Apply twin MCP tool implementations — 0G Compute only, no Anthropic SDK.

import { verifiedReason, setAgentState, getAgentState, appendIntegrationEvent } from '@cortex/kit';
import type { ApplicationRecord, Tracker } from './types.js';

const AGENT_NAME = 'apply-twin';

export interface ProfileData {
  summary: string;
  experience: string;
  skills: string[];
  targetRoles: string[];
  culture: string;
}

export async function getProfile(): Promise<ProfileData | null> {
  return getAgentState<ProfileData>(AGENT_NAME, 'profile');
}

export async function updateProfile(field: keyof ProfileData, value: unknown): Promise<void> {
  const current = (await getProfile()) ?? {} as ProfileData;
  (current as any)[field] = value;
  await setAgentState(AGENT_NAME, 'profile', current);
}

export async function getPipeline(): Promise<Tracker> {
  try {
    const tracker = await getAgentState<Tracker>(AGENT_NAME, 'pipeline');
    return tracker ?? { applications: [] };
  } catch (e) {
    console.warn('[apply-twin] getPipeline failed, returning empty:', (e as Error).message);
    return { applications: [] };
  }
}

export async function trackApplication(params: {
  company: string;
  role: string;
  status: ApplicationRecord['status'];
  notes?: string;
}): Promise<ApplicationRecord> {
  const tracker = await getPipeline();
  const existing = tracker.applications.findIndex(
    (a) => a.company.toLowerCase() === params.company.toLowerCase() && a.role.toLowerCase() === params.role.toLowerCase(),
  );

  const record: ApplicationRecord = existing >= 0
    ? { ...tracker.applications[existing], ...params, notes: params.notes ?? tracker.applications[existing].notes }
    : {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      company: params.company,
      role: params.role,
      status: params.status,
      appliedAt: params.status === 'sent' ? new Date().toISOString() : null,
      salaryExpectation: null,
      fitScore: 0,
      notes: params.notes ?? '',
      files: {},
    };

  if (existing >= 0) tracker.applications[existing] = record;
  else tracker.applications.push(record);

  try {
    await setAgentState(AGENT_NAME, 'pipeline', tracker);
  } catch (e) {
    console.warn('[apply-twin] setAgentState failed, pipeline not persisted:', (e as Error).message);
  }
  try {
    await appendIntegrationEvent(AGENT_NAME, {
      task: 'track_application',
      outcome: 'success',
      integration: 'apply',
      notes: `${params.company}/${params.role} → ${params.status}`,
    });
  } catch (e) {
    console.warn('[apply-twin] appendIntegrationEvent failed:', (e as Error).message);
  }
  return record;
}

export async function researchCompany(params: { company: string }): Promise<string> {
  let profile: ProfileData | null = null;
  try {
    profile = await getProfile();
  } catch (e) {
    console.warn('[apply-twin] getProfile failed, continuing without context:', (e as Error).message);
  }

  const result = await verifiedReason([
    {
      role: 'system',
      content: 'You are a job search research assistant. Provide concise, actionable company intelligence for a job applicant.',
    },
    {
      role: 'user',
      content: [
        `Research ${params.company} for a job application.`,
        profile ? `Applicant background: ${profile.summary}` : '',
        'Cover: company mission, product focus, culture signals, recent news, interview culture, what makes a strong candidate.',
        'Be specific. No generic platitudes. Max 300 words.',
      ].filter(Boolean).join('\n'),
    },
  ]);

  try {
    await appendIntegrationEvent(AGENT_NAME, {
      task: 'research_company',
      outcome: result.verified ? 'success' : 'unverified',
      integration: 'apply',
      notes: `Researched ${params.company}: ${result.text.slice(0, 200)}`,
    });
  } catch (e) {
    console.warn('[apply-twin] appendIntegrationEvent failed:', (e as Error).message);
  }

  return result.text;
}

export async function draftCoverLetter(params: {
  company: string;
  role: string;
  jd: string;
}): Promise<string> {
  console.error('[draft] start', params.company, params.role);
  let profile: ProfileData | null = null;
  try {
    profile = await getProfile();
  } catch (e) {
    console.warn('[apply-twin] getProfile failed, continuing without context:', (e as Error).message);
  }

  console.error('[draft] calling verifiedReason');
  const result = await verifiedReason([
    {
      role: 'system',
      content: 'You are an expert cover letter writer. Write compelling, specific, non-generic cover letters that get callbacks.',
    },
    {
      role: 'user',
      content: [
        `Write a cover letter for: ${params.role} at ${params.company}`,
        `\nJob description:\n${params.jd.slice(0, 2000)}`,
        profile ? `\nApplicant profile:\n${JSON.stringify(profile, null, 2)}` : '',
        '\nWrite a cover letter that:',
        '- Opens with a specific hook (not "I am excited to apply...")',
        '- Shows deep understanding of what they are building',
        '- Maps 2-3 specific experiences to their exact needs',
        '- Closes with confidence, not desperation',
        '- Max 350 words, 4 paragraphs',
      ].filter(Boolean).join('\n'),
    },
  ]);
  console.error('[draft] got result, verified=', result.verified);

  try {
    await appendIntegrationEvent(AGENT_NAME, {
      task: 'draft_cover_letter',
      outcome: result.verified ? 'success' : 'unverified',
      integration: 'apply',
      notes: `Drafted letter for ${params.company}/${params.role}`,
    });
  } catch (e) {
    console.warn('[apply-twin] appendIntegrationEvent failed:', (e as Error).message);
  }

  console.error('[draft] returning text, length=', result.text.length);
  return result.text;
}
