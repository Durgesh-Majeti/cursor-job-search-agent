import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { ANSWER_MEMORY_KEY } from "../lib/keys.js";
import type { AnswerMemory } from "../lib/types.js";

export default defineTool({
  description: "Recall confirmed form answers from host.kv answer memory.",
  effect: "read",
  inputSchema: z.object({
    query: z.string().optional().describe("Optional substring filter on the question."),
  }),
  async execute({ query }, ctx) {
    const memory = (await ctx.host.kv.get(ANSWER_MEMORY_KEY)) as AnswerMemory | undefined;
    if (!memory) return { answers: [], count: 0 };
    const q = query?.toLowerCase();
    const answers = q
      ? memory.answers.filter((a) => a.question.toLowerCase().includes(q))
      : memory.answers;
    return { answers, count: answers.length, updatedAt: memory.updatedAt };
  },
});
