export type ApplicationStatus = "lead" | "ready" | "sent" | "rejected" | "interview" | "offer";

export type ApplicationFileSet = {
  coverLetter?: string;
  emailDraft?: string;
  report?: string;
};

export type ApplicationRecord = {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  appliedAt: string | null;
  salaryExpectation: number | null;
  fitScore: number;
  notes: string;
  files: ApplicationFileSet;
};

export type Tracker = {
  applications: ApplicationRecord[];
};

export type JobInput = {
  company: string;
  role: string;
  description: string;
  sourceUrl?: string;
  location?: string;
  salaryExpectation?: number;
  notes?: string;
};

export type TrainingLetter = {
  company: string;
  text: string;
};

export type ProfileContext = {
  styleGuide: string;
  profileContext: string;
  trainingLetters: TrainingLetter[];
  tracker: Tracker;
};

export type AnalysisResult = {
  fitScore: number;
  angle: string;
  strengths: string[];
  gaps: string[];
  proofPoints: string[];
  risks: string[];
};

export type ResearchResult = {
  company: string;
  role: string;
  sourceUrl?: string;
  signals: string[];
  productNotes: string[];
  interviewHooks: string[];
};

export type LetterDraft = {
  subject: string;
  coverLetter: string;
  email: string;
};

export type CheckResult = {
  passed: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
};

export type PipelineOptions = {
  rootDir?: string;
  outDir?: string;
  model?: string;
  useAnthropic?: boolean;
  updateTracker?: boolean;
  status?: ApplicationStatus;
};

export type PipelineResult = {
  application: ApplicationRecord;
  analysis: AnalysisResult;
  research: ResearchResult;
  draft: LetterDraft;
  check: CheckResult;
  files: Required<ApplicationFileSet>;
};
