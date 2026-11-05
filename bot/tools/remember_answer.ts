import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { ANSWER_MEMORY_KEY } from "../lib/keys.js";
import type { AnswerMemory } from "../lib/types.js";

export default defineTool({
  description:
    "Store a confirmed recurring form answer in host.kv answer memory. Only save human-confirmed answers.",
  effect: "write",
  inputSchema: z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
    confirmed: z.boolean().default(true),
  }),
  dryRunResult: ({ question }) => ({ saved: false, dryRun: true, question }),
  async execute({ question, answer, confirmed }, ctx) {
    const now = new Date().toISOString();
    const existing =
      ((await ctx.host.kv.get(ANSWER_MEMORY_KEY)) as AnswerMemory | undefined) ?? {
        updatedAt: now,
        answers: [],
      };
    const answers = existing.answers.filter(
      (a) => a.question.toLowerCase() !== question.toLowerCase(),
    );
    answers.push({ question, answer, confirmed });
    const next: AnswerMemory = { updatedAt: now, answers };
    await ctx.host.kv.put(ANSWER_MEMORY_KEY, next);
    return { saved: true, count: answers.length };
  },
});
