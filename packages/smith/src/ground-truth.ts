// Real personality ground truth for persona generation.
//
// Layer 1: Big 5 scores anchored to demographic archetypes (academic LIWC/NEO-PI-R literature).
// Layer 2: Watch Dogs Legion NPC profiler facts — Ubisoft's demographic simulation system,
//   covering birthplace, work history, financial status, culture, and behavioral signatures
//   across 314 sections and ~8k facts. More reliable than live Reddit, richer than Big 5 alone.
// Layer 3: Few-shot seed personas (cyberpunk NPC pattern) — 3 hand-crafted examples that anchor
//   the LLM to generate dialogue samples in addition to structured fields.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PersonaSpec } from './types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const WD_FILE = path.join(REPO_ROOT, '.claude/profile-gt/watchdogs-profiles.txt');

// ─── Big 5 anchors ────────────────────────────────────────────────────────────

export interface Big5Scores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

const BIG5_ANCHORS: Array<{ keywords: string[]; scores: Big5Scores }> = [
  { keywords: ['gen-z', 'genz', 'zoomer', 'young', 'student', 'twenties'], scores: { openness: 0.75, conscientiousness: 0.40, extraversion: 0.60, agreeableness: 0.55, neuroticism: 0.65 } },
  { keywords: ['millennial', 'thirties', '30s'], scores: { openness: 0.70, conscientiousness: 0.58, extraversion: 0.55, agreeableness: 0.60, neuroticism: 0.55 } },
  { keywords: ['boomer', 'senior', 'retired', 'fifties', '50s', '60s', 'older'], scores: { openness: 0.45, conscientiousness: 0.72, extraversion: 0.52, agreeableness: 0.65, neuroticism: 0.40 } },
  { keywords: ['founder', 'entrepreneur', 'startup', 'ceo'], scores: { openness: 0.80, conscientiousness: 0.75, extraversion: 0.70, agreeableness: 0.45, neuroticism: 0.50 } },
  { keywords: ['parent', 'mom', 'dad', 'family', 'suburban'], scores: { openness: 0.50, conscientiousness: 0.68, extraversion: 0.55, agreeableness: 0.72, neuroticism: 0.48 } },
  { keywords: ['freelance', 'creative', 'artist', 'designer', 'writer'], scores: { openness: 0.88, conscientiousness: 0.42, extraversion: 0.50, agreeableness: 0.58, neuroticism: 0.60 } },
  { keywords: ['engineer', 'developer', 'tech', 'programmer', 'coder'], scores: { openness: 0.72, conscientiousness: 0.70, extraversion: 0.40, agreeableness: 0.52, neuroticism: 0.45 } },
  { keywords: ['renter', 'tenant', 'urban', 'city', 'apartment'], scores: { openness: 0.65, conscientiousness: 0.48, extraversion: 0.58, agreeableness: 0.60, neuroticism: 0.58 } },
];
const DEFAULT_BIG5: Big5Scores = { openness: 0.60, conscientiousness: 0.55, extraversion: 0.55, agreeableness: 0.58, neuroticism: 0.52 };

export function resolveBig5(archetype: string): Big5Scores {
  const slug = archetype.toLowerCase();
  for (const { keywords, scores } of BIG5_ANCHORS) {
    if (keywords.some((k) => slug.includes(k))) return scores;
  }
  return DEFAULT_BIG5;
}

// ─── Watch Dogs Legion fact pool ──────────────────────────────────────────────

// Section header keywords → WD section name fragments to pull facts from.
const WD_SECTION_MAP: Array<{ keywords: string[]; sections: string[] }> = [
  // ── Location / culture ──────────────────────────────────────────────────────
  { keywords: ['london', 'england', 'british', 'uk'], sections: ['BIRTHPLACE_ENGLAND', 'CULTURE_BIRTH_ENGLAND', 'BIRTHPLACE_IRELAND'] },
  { keywords: ['french', 'france', 'paris', 'european'], sections: ['BIRTHPLACE_FRANCE', 'CULTURE_BIRTH_FRANCE'] },
  { keywords: ['german', 'germany', 'berlin', 'munich'], sections: ['BIRTHPLACE_POLAND', 'CULTURE_BIRTH_POLAND', 'BIRTHPLACE_FRANCE'] },
  { keywords: ['indian', 'india', 'mumbai', 'delhi', 'bangalore'], sections: ['BIRTHPLACE_INDIA', 'CULTURE_BIRTH_INDIA'] },
  { keywords: ['american', 'usa', 'us', 'houston', 'new york', 'chicago'], sections: ['BIRTHPLACE_AMERICA', 'CULTURE_BIRTH_AMERICA'] },
  { keywords: ['chinese', 'china', 'beijing', 'shanghai', 'hong kong'], sections: ['BIRTHPLACE_CHINA', 'CULTURE_BIRTH_CHINA', 'BIRTHPLACE_HONGKONG'] },
  { keywords: ['nigerian', 'nigeria', 'african', 'ghana', 'kenya', 'afropunk'], sections: ['BIRTHPLACE_NIGERIA', 'CULTURE_BIRTH_NIGERIA', 'BIRTHPLACE_GHANA', 'BIRTHPLACE_KENYA', 'AFROPUNK'] },
  { keywords: ['polish', 'poland', 'warsaw'], sections: ['BIRTHPLACE_POLAND', 'CULTURE_BIRTH_POLAND'] },
  { keywords: ['jamaican', 'jamaica', 'caribbean'], sections: ['BIRTHPLACE_JAMAICA'] },
  { keywords: ['bangladeshi', 'bangladesh'], sections: ['BIRTHPLACE_BANGLADESH'] },
  { keywords: ['pakistani', 'pakistan'], sections: ['BIRTHPLACE_PAKISTAN'] },
  { keywords: ['russian', 'russia', 'eastern european'], sections: ['BIRTHPLACE_RUSSIA'] },
  { keywords: ['iranian', 'iran', 'persian'], sections: ['BIRTHPLACE_IRAN'] },
  { keywords: ['south african', 'southafrica'], sections: ['BIRTHPLACE_SOUTHAFRICA'] },
  { keywords: ['refugee', 'asylum', 'displaced'], sections: ['IMMIGRATION_REFUGEE'] },
  { keywords: ['undocumented', 'illegal immigrant', 'no papers'], sections: ['IMMIGRATION_UNDOCUMENTED'] },
  { keywords: ['visa', 'work permit', 'expat'], sections: ['IMMIGRATION_WORKVISA'] },
  // ── Work / profession ───────────────────────────────────────────────────────
  { keywords: ['tech', 'developer', 'engineer', 'coder', 'programmer', 'software'], sections: ['GROUP_TECH'] },
  { keywords: ['art', 'artist', 'creative', 'illustrator', 'painter'], sections: ['GROUP_ART', 'SUBCULTURE_ARTSY'] },
  { keywords: ['design', 'designer', 'ux', 'ui', 'graphic'], sections: ['GROUP_ART', 'GROUP_THEATRE'] },
  { keywords: ['finance', 'banker', 'trader', 'investor', 'accountant'], sections: ['GROUP_FINANCE'] },
  { keywords: ['education', 'teacher', 'tutor', 'professor', 'academic'], sections: ['GROUP_EDUCATION'] },
  { keywords: ['construction', 'builder', 'tradesperson', 'plumber'], sections: ['GROUP_CONSTRUCTION'] },
  { keywords: ['beauty', 'makeup', 'stylist', 'cosmetology'], sections: ['GROUP_BEAUTY'] },
  { keywords: ['actor', 'performer', 'theatre', 'drama', 'improv'], sections: ['GROUP_THEATRE'] },
  { keywords: ['medical', 'nurse', 'doctor', 'healthcare', 'paramedic'], sections: ['GROUP_MEDICAL'] },
  { keywords: ['law', 'lawyer', 'solicitor', 'barrister', 'legal'], sections: ['GROUP_LAW'] },
  { keywords: ['government', 'civil servant', 'council', 'public sector'], sections: ['GROUP_GOVERNMENT'] },
  { keywords: ['food', 'chef', 'restaurant', 'hospitality', 'barista', 'bartender'], sections: ['GROUP_FOODDRINK', 'GROUP_HOSPITALITY'] },
  { keywords: ['media', 'journalist', 'reporter', 'tv', 'broadcast'], sections: ['GROUP_MEDIATV', 'GROUP_MEDIAPRODUCT'] },
  { keywords: ['science', 'researcher', 'scientist', 'lab', 'phd'], sections: ['GROUP_SCIENCE'] },
  { keywords: ['sport', 'athlete', 'fitness', 'gym', 'coach'], sections: ['GROUP_SPORTS', 'SUBCULTURE_ATHLETIC'] },
  { keywords: ['museum', 'curator', 'gallery', 'heritage'], sections: ['GROUP_MUSEUM'] },
  { keywords: ['gig', 'delivery', 'uber', 'freelance gig', 'zero hours'], sections: ['GROUP_TRANSIENT', 'GROUP_OFFICE_OR_RETAIL'] },
  { keywords: ['retail', 'shop', 'store', 'sales', 'customer service'], sections: ['GROUP_OFFICE_OR_RETAIL'] },
  { keywords: ['transit', 'driver', 'bus', 'train', 'logistics'], sections: ['GROUP_TRANSIT'] },
  { keywords: ['maintenance', 'cleaner', 'janitor', 'facilities'], sections: ['GROUP_MAINTENANCE'] },
  // ── Financial status ────────────────────────────────────────────────────────
  { keywords: ['broke', 'poor', 'struggling', 'unemployed', 'benefits', 'welfare'], sections: ['INCOME_NONE', 'INCOME_POOR'] },
  { keywords: ['renter', 'tenant', 'flatshare', 'budget', 'low income', 'working class'], sections: ['INCOME_LOW', 'INCOME_POOR'] },
  { keywords: ['middle class', 'comfortable', 'salary', 'mortgage'], sections: ['INCOME_MEDIUM'] },
  { keywords: ['high earner', 'senior', 'manager', 'director', 'professional'], sections: ['INCOME_HIGH'] },
  { keywords: ['founder', 'startup', 'entrepreneur', 'wealthy', 'investor', 'vc', 'angel'], sections: ['INCOME_RICH', 'GROUP_FINANCE'] },
  { keywords: ['executive', 'ceo', 'billionaire', 'ultra-high', 'private equity'], sections: ['INCOME_EXECUTIVE', 'INCOME_RICH'] },
  // ── Subculture / personality ─────────────────────────────────────────────────
  { keywords: ['nerd', 'academic', 'intellectual', 'book', 'library', 'scholar'], sections: ['SUBCULTURE_NERDY'] },
  { keywords: ['gamer', 'gaming', 'esports', 'twitch', 'streamer', 'game'], sections: ['SUBCULTURE_GAMER'] },
  { keywords: ['geek', 'comic', 'sci-fi', 'fantasy', 'tabletop', 'anime', 'manga'], sections: ['SUBCULTURE_GEEKY'] },
  { keywords: ['artsy', 'gallery', 'museum', 'theatre', 'opera', 'classical', 'literary'], sections: ['SUBCULTURE_ARTSY'] },
  { keywords: ['punk', 'counterculture', 'anarchist', 'subversive', 'anti-establishment', 'body mod', 'parkour'], sections: ['SUBCULTURE_COUNTERCULTURE'] },
  { keywords: ['futurist', 'transhumanist', 'longevity', 'crypto', 'ar', 'vr', 'singularity', 'biohack'], sections: ['SUBCULTURE_FUTURIST'] },
  { keywords: ['conspiracy', 'flat earth', 'truther', 'anti-vax', 'deep state', 'cryptid'], sections: ['SUBCULTURE_CONSPIRACY'] },
  { keywords: ['hooligan', 'football fan', 'ultra', 'sports fan', 'lads', 'darts', 'wrestling'], sections: ['SUBCULTURE_HOOLIGAN'] },
  { keywords: ['vain', 'influencer', 'instagram', 'selfie', 'beauty', 'fashion', 'status'], sections: ['SUBCULTURE_VAIN'] },
  { keywords: ['charity', 'volunteer', 'nonprofit', 'activist', 'organizer', 'advocate'], sections: ['SUBCULTURE_CHARITY'] },
  { keywords: ['silly', 'chaotic', 'random', 'meme', 'ironic', 'absurdist'], sections: ['SUBCULTURE_SILLY'] },
  { keywords: ['old', 'retired', 'senior', 'pensioner', 'boomer', 'elderly'], sections: ['SUBCULTURE_OLD'] },
  { keywords: ['queer', 'lgbt', 'gay', 'bi', 'trans', 'non-binary', 'enby'], sections: ['SUBCULTURE_QUEER'] },
  { keywords: ['athletic', 'marathon', 'cyclist', 'crossfit', 'triathlon', 'physical'], sections: ['SUBCULTURE_ATHLETIC'] },
  // ── Leisure / behaviour ─────────────────────────────────────────────────────
  { keywords: ['drinking', 'pub', 'bar', 'alcohol', 'wine', 'beer', 'cocktail'], sections: ['LEISURE_DRINKING'] },
  { keywords: ['gambling', 'betting', 'casino', 'poker', 'lottery'], sections: ['LEISURE_GAMBLING'] },
  { keywords: ['drug', 'recreational drug', 'weed', 'cannabis', 'party drug'], sections: ['LEISURE_DRUGS'] },
  { keywords: ['fishing', 'angling', 'outdoors', 'countryside', 'rural'], sections: ['LEISURE_FISHING'] },
  { keywords: ['therapy', 'mental health', 'depression', 'anxiety', 'counselling', 'therapist'], sections: ['LEISURE_THERAPY'] },
  { keywords: ['rehab', 'recovery', 'addiction', 'sobriety', 'AA'], sections: ['LEISURE_REHAB'] },
  // ── Content creators / digital ───────────────────────────────────────────────
  { keywords: ['streamer', 'content creator', 'youtuber', 'podcast', 'tiktok', 'influencer'], sections: ['HVC'] },
  { keywords: ['protest', 'activist', 'organizer', 'advocate', 'grassroots'], sections: ['HVC'] },
  { keywords: ['hacker', 'dedsec', 'cyberpunk', 'tech activist', 'ctf', 'security'], sections: ['GROUP_TECH', 'HVC', 'SPECIAL_DUDSEC'] },
  // ── Religion ─────────────────────────────────────────────────────────────────
  { keywords: ['muslim', 'islam', 'islamic'], sections: ['RELIGION_MUSLIM'] },
  { keywords: ['christian', 'church', 'faith', 'evangelical', 'catholic'], sections: ['RELIGION_CHRISTIAN'] },
  { keywords: ['jewish', 'judaism', 'synagogue'], sections: ['RELIGION_JEWISH'] },
];

// Parse the WD file once and cache in module scope.
let _wdDB: Map<string, string[]> | null = null;

function loadWatchDogsDB(): Map<string, string[]> {
  if (_wdDB) return _wdDB;
  _wdDB = new Map();
  if (!fs.existsSync(WD_FILE)) return _wdDB;

  const lines = fs.readFileSync(WD_FILE, 'utf8').split('\n');
  let currentKey = 'MISC';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('===')) {
      // Extract section name from header: === ...SECTION_NAME | LABEL ===
      const pipe = line.indexOf(' | ');
      const inner = pipe > 0 ? line.slice(0, pipe) : line;
      // Get the last dotted segment as the section key
      const parts = inner.replace(/^=+\s*/, '').split('.');
      currentKey = parts[parts.length - 1].trim().toUpperCase();
      if (!_wdDB.has(currentKey)) _wdDB.set(currentKey, []);
      continue;
    }
    // Fact line: ID | KEY | Text
    const cols = line.split(' | ');
    if (cols.length >= 3) {
      const text = cols.slice(2).join(' | ').trim();
      if (text && text.length > 4) {
        const bucket = _wdDB.get(currentKey) ?? [];
        bucket.push(text);
        _wdDB.set(currentKey, bucket);
      }
    }
  }
  return _wdDB;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function sampleWatchDogsFacts(archetype: string, n = 18): string[] {
  const db = loadWatchDogsDB();
  const slug = archetype.toLowerCase();

  // Collect matching section keys
  const matchedKeys = new Set<string>();
  for (const { keywords, sections } of WD_SECTION_MAP) {
    if (keywords.some((k) => slug.includes(k) || k.split(' ').some((w) => slug.includes(w)))) {
      sections.forEach((s) => matchedKeys.add(s));
    }
  }

  // Always include generic lifestyle + universal human facts
  matchedKeys.add('FACTS_MISCELLANEOUS');
  matchedKeys.add('CUSTOM_FACTS');
  matchedKeys.add('ANYONE');
  matchedKeys.add('NEW_REQUESTS');

  const pool: string[] = [];
  for (const key of matchedKeys) {
    // Partial match — WD keys may have prefixes from parsing
    for (const [dbKey, facts] of db) {
      if (dbKey.includes(key) || key.includes(dbKey)) {
        pool.push(...facts);
      }
    }
  }

  if (pool.length === 0) {
    // Fallback: sample from all sections
    for (const facts of db.values()) pool.push(...facts);
  }

  return pickRandom(pool, n);
}

// ─── Few-shot seed personas (cyberpunk NPC pattern) ───────────────────────────
// Hand-crafted examples that demonstrate the output richness we expect.
// Qwen uses these as format anchors — it sees what a "good persona" looks like
// and generates dialogue samples alongside the structured fields.

export const SEED_PERSONAS: Omit<PersonaSpec, 'cohortId'>[] = [
  {
    archetype: 'gen-z-renter-london',
    targetMarket: 'urban renters 22-28',
    lifeStory: 'Grew up in Sheffield, moved to London at 19 for a music tech course that she eventually dropped. Now splits a Zone 3 flat with three others and does UX contract work she found on Twitter. Her parents divorced when she was 12 and she handled it by becoming intensely online. She has a complicated relationship with spending — anxious about money but buys things impulsively when stressed.',
    values: ['authenticity', 'flexibility', 'digital minimalism', 'community'],
    traumas: ['parents\' divorce felt invisible at school — nobody talked about it', 'first proper job laid her off over Slack with two sentences'],
    mediaDiet: ['TikTok', 'Substack newsletters', 'YouTube essays', 'group chats'],
    techLiteracy: 'high',
    communicationStyle: 'dry, self-aware humour; uses rhetorical questions; trails off mid-thought when uncomfortable',
    wdFacts: ['Accrued over £5,000 in credit card debt', 'Received loan from family', 'Posts frequently on tech Q&A forums', 'Recently purchased: illustration software'],
    dialogueSamples: [
      "Honestly? I downloaded it, looked at the onboarding, and uninstalled. The vibes were off.",
      "My flatmate tried to get me to split a subscription and I was like... I don't even trust you with the washing-up rota.",
      "I would pay for it but not that much. Not with rent being what it is.",
      "There's something about the way it's designed that makes me feel like I'm being sold to? And I hate that feeling.",
    ],
  },
  {
    archetype: 'boomer-dad-houston',
    targetMarket: 'homeowners 52-65, suburban US',
    lifeStory: 'Retired petrochemical engineer, spent 30 years at the same company and took early retirement when automation cut his division. His wife manages their finances; he focuses on the house, his truck, and his woodworking hobby. His oldest son is gay and came out five years ago — he handled it badly at first and is still quietly repairing that relationship. He distrusts new technology unless his son explains it.',
    values: ['reliability', 'self-reliance', 'family', 'earned trust'],
    traumas: ['layoff after 30 years — even though it was voluntary, it felt like rejection', 'estrangement from his son lasted two years and he still feels guilt about it'],
    mediaDiet: ['local TV news', 'YouTube tutorials', 'Fox News (less than he used to)', 'Facebook'],
    techLiteracy: 'low',
    communicationStyle: 'direct, slightly formal; mistrustful of enthusiasm; uses analogies from physical work; pauses before answering',
    wdFacts: ['Attended auto show', 'Owns custom-built motorcycle', 'Unpaid traffic camera violations', 'Challenged parking violations at Camden Council Estate'],
    dialogueSamples: [
      "I'm not saying it's a bad product. I'm saying I don't understand why it needs my location.",
      "My son set it up for me. I used it twice. Then something updated and I couldn't find anything.",
      "If something breaks, I want to be able to fix it myself. Or at least call someone. Not read a help article.",
      "When I was working, we had a process. You follow the process, you get the result. This doesn't feel like that.",
    ],
  },
  {
    archetype: 'solo-founder-mumbai',
    targetMarket: 'tech entrepreneurs 28-40, South Asia',
    lifeStory: 'Second-generation IIT graduate, turned down a Google offer to run an edtech startup that failed in 2021. Now consulting while building a B2B SaaS tool on weekends. His parents wanted stability; this constant uncertainty is a quiet source of shame he manages through relentless productivity. He sleeps five hours a night and considers this a strategy, not a problem.',
    values: ['leverage', 'speed', 'frugality', 'compounding'],
    traumas: ['first startup failure felt public — his LinkedIn updates had an audience', 'father stopped asking about the business, which felt worse than criticism'],
    mediaDiet: ['Twitter/X', 'Hacker News', 'Acquired podcast', 'WhatsApp family group (muted)'],
    techLiteracy: 'high',
    communicationStyle: 'fast, precise, skips pleasantries; evaluates everything on ROI; occasionally self-deprecating about the startup lifestyle',
    wdFacts: ['Participated in university hackathon', 'Contributed to multiple open source software projects', 'Purchased Broca Tech software', 'Searched for: "Broca Tech AI"'],
    dialogueSamples: [
      "Okay so the onboarding took me four minutes. That's too long. Your competitor does it in ninety seconds.",
      "I don't care about the feature set — I care about what it costs me per hour of my time saved.",
      "I'd pay for this if it integrates with my stack. If it doesn't, it's dead to me regardless of the price.",
      "The pitch deck problem with this is that it solves a vitamin, not a painkiller. I feel that as a user too.",
    ],
  },
];

// ─── Public interface ──────────────────────────────────────────────────────────

export interface GroundTruth {
  big5: Big5Scores;
  wdFacts: string[];
  seedPersona: typeof SEED_PERSONAS[number] | null;
}

export async function fetchGroundTruth(archetype: string): Promise<GroundTruth> {
  const big5 = resolveBig5(archetype);
  const wdFacts = sampleWatchDogsFacts(archetype);

  // Find closest seed persona by keyword overlap
  const slug = archetype.toLowerCase();
  let bestSeed: typeof SEED_PERSONAS[number] | null = null;
  let bestScore = 0;
  for (const seed of SEED_PERSONAS) {
    const score = seed.archetype.toLowerCase().split('-').filter((w) => slug.includes(w)).length;
    if (score > bestScore) { bestScore = score; bestSeed = seed; }
  }

  return { big5, wdFacts, seedPersona: bestSeed };
}
