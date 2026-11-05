import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  applicationByJobKey,
  applicationIndexKey,
  applicationKey,
} from "../lib/keys.js";
import type {
  ApplicationIndex,
  ApplicationRecord,
  ApplicationStatus,
} from "../lib/types.js";

const statuses = [
  "draft",
  "approved",
  "tailoring",
  "ready_to_apply",
  "applying",
  "applied",
  "blocked",
  "needs_human",
  "skipped",
  "withdrawn",
] as const satisfies readonly ApplicationStatus[];

export default defineTool({
  description:
    "Create or update an application in host.kv. Status must be approved before apply. Report applied / blocked / needs_human after attempts.",
  effect: "write",
  inputSchema: z.object({
    id: z.string().min(1),
    jobId: z.string().min(1),
    status: z.enum(statuses),
    blocker: z.string().optional(),
    evidence: z.array(z.string()).optional(),
    attemptNote: z.string().optional(),
    artifactPaths: z
      .object({
        resume: z.string().optional(),
        coverLetter: z.string().optional(),
        qaMap: z.string().optional(),
      })
      .optional(),
  }),
  dryRunResult: ({ id, status }) => ({ saved: false, dryRun: true, id, status }),
  async execute(input, ctx) {
    const now = new Date().toISOString();
    const key = applicationKey(input.id);
    const existing = (await ctx.host.kv.get(key)) as ApplicationRecord | undefined;
    const attemptLog = existing?.attemptLog ? [...existing.attemptLog] : [];
    if (input.attemptNote) {
      attemptLog.push({ at: now, note: input.attemptNote });
    }

    const record: ApplicationRecord = {
      id: input.id,
      jobId: input.jobId,
      status: input.status,
      blocker: input.blocker ?? existing?.blocker,
      evidence: input.evidence ?? existing?.evidence,
      attemptLog,
      artifactPaths: {
        ...existing?.artifactPaths,
        ...input.artifactPaths,
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await ctx.host.kv.put(key, record);
    await ctx.host.kv.put(applicationByJobKey(input.jobId), input.id);

    const index =
      ((await ctx.host.kv.get(applicationIndexKey())) as ApplicationIndex | undefined) ?? {
        ids: [],
      };
    if (!index.ids.includes(input.id)) {
      index.ids.push(input.id);
      await ctx.host.kv.put(applicationIndexKey(), index);
    }

    return { saved: true, application: record };
  },
});
