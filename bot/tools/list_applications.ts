import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { applicationIndexKey, applicationKey } from "../lib/keys.js";
import type { ApplicationIndex, ApplicationRecord, ApplicationStatus } from "../lib/types.js";

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
  description: "List applications from host.kv, optionally filtered by status.",
  effect: "read",
  inputSchema: z.object({
    status: z.enum(statuses).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  async execute({ status, limit }, ctx) {
    const index =
      ((await ctx.host.kv.get(applicationIndexKey())) as ApplicationIndex | undefined) ?? {
        ids: [],
      };
    const apps: ApplicationRecord[] = [];
    for (const id of index.ids) {
      const app = (await ctx.host.kv.get(applicationKey(id))) as
        | ApplicationRecord
        | undefined;
      if (!app) continue;
      if (status && app.status !== status) continue;
      apps.push(app);
    }
    const sliced = apps.slice(-(limit ?? 50));
    return {
      count: sliced.length,
      applications: sliced.map((a) => ({
        id: a.id,
        jobId: a.jobId,
        status: a.status,
        blocker: a.blocker ?? null,
        updatedAt: a.updatedAt,
      })),
    };
  },
});
