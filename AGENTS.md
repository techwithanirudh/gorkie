# gorkie

This project is a customizable AI assistant for Slack, built on Bun,
TypeScript, Mastra channels, Chat SDK's Slack adapter in Socket Mode, E2B
sandboxes, Postgres, and Mastra observability (local DuckDB in development,
plus Langfuse).

## CRITICAL: Load the `mastra` skill first

Load the `mastra` skill BEFORE any Mastra work, and read the embedded docs/source in `node_modules/@mastra/*` rather than guessing. Mastra APIs change between versions; cached knowledge is usually wrong.

## Setup: use the `wizard` skill

If a person asks how to set up the project, load the `wizard` skill and generate a wizard tailored to their needs (services to configure, where state lives, optional integrations, whether to commit the script).

## TODO and IMPLEMENTED

Two files, and the split matters. `TODO.md` is only what is left. `IMPLEMENTED.md`
is what is finished, and it is where the reasoning lives.

- When the user asks for anything, small or large, add it to `TODO.md`
  immediately, in the right group.
- Tick an item the moment it is done. Once the user has seen it is done, move
  the whole entry to `IMPLEMENTED.md` under a `## YYYY-MM-DD` heading, newest
  first, tagged with the `TODO.md` section it came from.
- Never summarise on the way across. The detail is the point: what was tried,
  what the file and line references were, what turned out to be wrong, and what
  was deliberately not done. A one-line "done" entry is worth nothing later.
- Record the things that did not work too. An item that was built and reverted,
  or a premise that turned out false, belongs in `IMPLEMENTED.md` saying so,
  because the next person will otherwise propose it again.
- Before saying you are finished, re-read `TODO.md` and confirm nothing asked
  is left unlogged.

## Mental Model

One Mastra `Agent` (`orchestrator`) serves Slack through Mastra's built-in
`channels`, delegating to `research` and `explore` for scoped subagent work.
Channels owns Socket Mode, streaming, live tool widgets, typing
status, thread-history backfill, and `MastraStateAdapter`.

The agent brain runs on the host. Code execution runs in a per-thread **E2B** sandbox (isolated cloud Linux VM). Model keys, Slack tokens, and DB credentials live on the host and never enter the sandbox.

Storage is **Postgres** for agent memory and channel state. Long-term memory uses
thread-scoped **Observational Memory**.
Observability traces go to **Langfuse** (`@mastra/langfuse`), configured in
`src/mastra/index.ts`. In development they are also written to a local DuckDB
file (`observability.duckdb`, anchored to `env.PROJECT_ROOT` rather than cwd,
wired via `MastraStorageExporter` on a `MastraCompositeStore` domain override).
DuckDB is single-writer, so a running `mastra dev`/`mastra start` holds the
lock; query it read-only while the server is stopped.

`slackIdentity` (`src/mastra/observability/slack-identity.ts`) stamps the Slack
identity onto the root span, so `sessionId` is the Slack thread and every turn
of a conversation collapses into one Langfuse session. `LangfuseFeedbackExporter`
forwards feedback as Langfuse scores, which `@mastra/langfuse` does not do
itself because it implements no `onFeedbackEvent` handler.

## Boundaries

- Never run user/agent code on the host. E2B sandbox only; nothing else touches our OS.
- Never put secrets (model keys, Slack tokens, DB creds) into the sandbox.
- Never hand-roll what channels already does (streaming, history fetch, multi-user prefixes). Control it through `handlers`, `threadContext`, and subscription state.
- Never read `process.env` outside `src/env.ts`.
- Ask first: dependency changes, schema-shape changes, destructive git operations.
- Every model in `src/mastra/providers.ts` must hold at least 1M input tokens. The orchestrator, `research` and `explore` share one fallback ladder, so a short-context entry does not degrade one agent, it breaks whichever agent happens to fail over onto it mid-thread. Check the context window on models.dev before adding one. Separately, `agent.maxTokens.output` must stay under the smallest output cap in use (65,536, `google/gemini-3.5-flash-lite`), which is also why Observational Memory overrides Mastra's 100,000 default.
- Never start, restart, or kill `mastra dev`/`mastra start`/the built server on your own initiative. This is a live Slack bot; the user runs it themselves, and two instances racing for the same Slack Socket Mode connection causes real, confusing failures. If you must verify a code change actually works, ask the user to test it in their own running instance, or use `mastra api` against whatever they already have running instead of launching a new process.

## Coding Rules

Always read and follow [CODING_STANDARDS.md](./CODING_STANDARDS.md) before
writing or modifying code. It is the source of truth for coding rules.

- Inline over extract: no one-shot helpers or wrappers.
- Avoid one-use constants: inline single-use literals.
- Dict params: a function with more than one parameter takes a single options object.
- Small functions: prefer early returns over nesting.
- No type casts to silence TypeScript: validate with Zod at boundaries instead.
- No what-comments, no JSDoc. Comment only a non-obvious *why*.
- Types live in `src/mastra/types/`, not scattered across modules.
- Direct names: delete dead wrappers instead of renaming them.
- No em dashes anywhere (markdown, prose, comments, replies). Use a comma, colon, or period instead.

## Validation

After code changes:

1. `bun run typecheck`
2. `bun run check` (Biome/ultracite) and `bun run check:spelling`

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Skills Discovery](https://mastra.ai/.well-known/skills/index.json)
- [Run and setup guide](./README.md)

<!-- BEGIN @agent-native/skills -->
When long-running or parallel work needs usage-limit checks, use the /stay-within-limits skill always.
<!-- END @agent-native/skills -->
