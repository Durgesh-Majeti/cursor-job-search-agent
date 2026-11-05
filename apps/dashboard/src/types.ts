export type DisplayStatus =
  | "pending"
  | "approved"
  | "applied"
  | "blocked"
  | "needs_human";

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
};

export type JobsResponse = {
  updatedAt: string;
  applicationName: string | null;
  sources: Record<string, string>;
  counts: Record<DisplayStatus, number>;
  jobs: JobRow[];
};
