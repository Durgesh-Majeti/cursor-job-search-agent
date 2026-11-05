/** Shared JSON shapes stored in `host.kv`. Use type aliases (not interfaces). */

export type Profile = {
  updatedAt: string;
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  links?: { label: string; url: string }[];
  targetRoles?: string[];
  targetLocations?: string[];
  constraints?: string[];
  /** Free-form notes; facts only — never invent. */
  notes?: string;
  /** True when user has not supplied a real resume yet. */
  placeholder?: boolean;
};

export type ExperienceBullet = {
  id: string;
  employer: string;
  title: string;
  start?: string;
  end?: string | null;
  skills?: string[];
  /** STAR-style bullet grounded in real work. */
  text: string;
  metrics?: string[];
};

export type ExperienceLibrary = {
  updatedAt: string;
  bullets: ExperienceBullet[];
  skills: string[];
  placeholder?: boolean;
};

export type JobSource =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "linkedin"
  | "indeed"
  | "loopcv"
  | "careers"
  | "other";

export type JobRecord = {
  id: string;
  url: string;
  title: string;
  company: string;
  source: JobSource;
  jd?: string;
  fitScore?: number;
  fitNotes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationStatus =
  | "draft"
  | "approved"
  | "tailoring"
  | "ready_to_apply"
  | "applying"
  | "applied"
  | "blocked"
  | "needs_human"
  | "skipped"
  | "withdrawn";

export type ApplicationRecord = {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  blocker?: string;
  evidence?: string[];
  attemptLog?: { at: string; note: string }[];
  artifactPaths?: {
    resume?: string;
    coverLetter?: string;
    qaMap?: string;
  };
  updatedAt: string;
  createdAt: string;
};

export type AnswerMemory = {
  updatedAt: string;
  answers: { question: string; answer: string; confirmed: boolean }[];
};

export type JobIndex = { ids: string[] };
export type ApplicationIndex = { ids: string[] };
