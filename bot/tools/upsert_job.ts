import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { jobIndexKey, jobKey } from "../lib/keys.js";
import type { JobIndex, JobRecord, JobSource } from "../lib/types.js";

const sources = [
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "linkedin",
  "indeed",
  "loopcv",
  "careers",
  "other",
] as const satisfies readonly JobSource[];

export default defineTool({
  description:
    "Create or update a job listing in host.kv. Idempotent on the same job id.",
  effect: "idempotent",
  inputSchema: z.object({
    id: z.string().min(1),
    url: z.string().url(),
    title: z.string().min(1),
    company: z.string().min(1),
    source: z.enum(sources),
    jd: z.string().optional(),
    fitScore: z.number().min(0).max(100).optional(),
    fitNotes: z.string().optional(),
  }),
  dryRunResult: ({ id }) => ({ saved: false, dryRun: true, id }),
  async execute(input, ctx) {
    const now = new Date().toISOString();
    const key = jobKey(input.id);
    const existing = (await ctx.host.kv.get(key)) as JobRecord | undefined;
    const record: JobRecord = {
      id: input.id,
      url: input.url,
      title: input.title,
      company: input.company,
      source: input.source,
      jd: input.jd ?? existing?.jd,
      fitScore: input.fitScore ?? existing?.fitScore,
      fitNotes: input.fitNotes ?? existing?.fitNotes,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await ctx.host.kv.put(key, record);

    const index = ((await ctx.host.kv.get(jobIndexKey())) as JobIndex | undefined) ?? {
      ids: [],
    };
    if (!index.ids.includes(input.id)) {
      index.ids.push(input.id);
      await ctx.host.kv.put(jobIndexKey(), index);
    }

    return { saved: true, job: record };
  },
});
