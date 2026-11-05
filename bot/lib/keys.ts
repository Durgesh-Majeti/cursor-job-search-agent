/** Durable `host.kv` key helpers for job-search state. */

export const PROFILE_KEY = "jobsearch:profile";
export const EXPERIENCE_KEY = "jobsearch:experience_library";
export const ANSWER_MEMORY_KEY = "jobsearch:answer_memory";

export function jobKey(jobId: string): string {
  return `jobsearch:job:${jobId}`;
}

export function jobIndexKey(): string {
  return "jobsearch:job_index";
}

export function applicationKey(applicationId: string): string {
  return `jobsearch:application:${applicationId}`;
}

export function applicationIndexKey(): string {
  return "jobsearch:application_index";
}

export function applicationByJobKey(jobId: string): string {
  return `jobsearch:application_by_job:${jobId}`;
}
