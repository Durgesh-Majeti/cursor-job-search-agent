export type DisplayStatus =
  | "pending"
  | "approved"
  | "queued"
  | "applied"
  | "blocked"
  | "needs_human"
  | "skipped";

export type PlatformId = "linkedin" | "indeed" | "greenhouse" | "loopcv";

export type JobRow = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  url: string | null;
  source: string | null;
  fitScore: number | null;
  fitNotes: string | null;
  status: DisplayStatus;
  reason: string | null;
  evidence: string | string[] | null;
  artifactPath: string | null;
  statusSource: string;
  approvedAt?: string | null;
  queuedAt?: string | null;
  queueStatus?: string | null;
};

export type JobsResponse = {
  updatedAt: string;
  applicationName: string | null;
  sources: Record<string, string>;
  search: {
    platforms: string[];
    status: string;
    updatedAt: string | null;
    note: string | null;
    resultCount: number | null;
  } | null;
  counts: Record<DisplayStatus, number>;
  jobs: JobRow[];
};

export type ResumeAnalysis = {
  analysedAt: string;
  sourcePath: string | null;
  wordCount: number;
  score: number;
  applicationName?: string;
  targetRoles: string[];
  keywordHits: Record<string, string[]>;
  roleFit: Array<{ role: string; score: number; matched: string[] }>;
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  method: string;
  note: string;
};

export type ResumeInfo = {
  current: {
    path: string;
    kind: string;
    bytes: number;
    mtime: string;
  } | null;
  analysis: ResumeAnalysis | null;
};

export type GmailStatus = {
  connected: boolean;
  updatedAt: string | null;
  source: string;
  note: string;
  confirmationCount: number;
  confirmations: unknown[];
  message?: string;
};
