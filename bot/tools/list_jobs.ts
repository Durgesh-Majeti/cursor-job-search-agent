import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { jobIndexKey, jobKey } from "../lib/keys.js";
import type { JobIndex, JobRecord } from "../lib/types.js";

export default defineTool({
  description: "List known jobs from host.kv (id, title, company, fitScore, source).",
  effect: "read",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(100).optional(),
  }),
  async execute({ limit }, ctx) {
    const index = ((await ctx.host.kv.get(jobIndexKey())) as JobIndex | undefined) ?? {
      ids: [],
    };
    const ids = index.ids.slice(-(limit ?? 50));
    const jobs: JobRecord[] = [];
    for (const id of ids) {
      const job = (await ctx.host.kv.get(jobKey(id))) as JobRecord | undefined;
      if (job) jobs.push(job);
    }
    return {
      count: jobs.length,
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        source: j.source,
        fitScore: j.fitScore ?? null,
        url: j.url,
      })),
    };
  },
});
