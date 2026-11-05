# job-search-agent

Agent SDK project (`@grok/agent-sdk`). This file is for coding agents editing
the project. The served agent's prompt is `bot/instructions.md`.

## Loop

```bash
npx --yes "@grok/agent-sdk@0.6.0" validate --dir .
npx --yes "@grok/agent-sdk@0.6.0" info --dir . --json
npx --yes "@grok/agent-sdk@0.6.0" run --dir . --message "..."
npx --yes "@grok/agent-sdk@0.6.0" eval --dir .
npm run check
```

Run the CLI under Node, never Bun.

## Layout

- `bot/instructions.md` — always-on prompt (keep short; procedures live in skills)
- `bot/skills/*.md` — setup, scout, fit-score, tailor-resume, cover-letter, apply, verify, track, briefing
- `bot/tools/*.ts` — one tool per file; durable state via `ctx.host.kv`
- `bot/lib/` — shared keys/types only (never discovered)
- `bot/mcp-connections/` — enable optional MCP here (empty by default)
- `bot/host-connections/` — privileged local browser MCP (empty by default)
- `docs/examples/` — LoopCV + Chrome DevTools connection stubs (copy to enable)
- `bot/sandbox/workspace/` — profile, experience library, resume (PDF + md)
- `docs/local-apply.md` — Chrome DevTools MCP + self-hosted worker notes
- `evals/` — filesystem evals (`evals/evals.config.ts` required)

## Do not

- Invent employers, dates, metrics, or credentials in skills or sample data
- Auto-apply without `approved` / `ready_to_apply` application status
- Enable LoopCV as the core product — optional listing source only
- Add npm deps on a first cut beyond what `@grok/agent-sdk` ships
- Point `serve` at a parent folder during bring-up

## Pointers

- Package loop: `node_modules/@grok/agent-sdk/AGENTS.md`
- Docs: `npx @grok/agent-sdk docs`
