# gorkie

This project is a customizable AI assistant for Slack, built on Bun,
TypeScript, Mastra channels, Chat SDK's Slack adapter in webhook mode, E2B
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
Channels owns the Slack webhook route, streaming, live tool widgets, typing
status, and `MastraStateAdapter`. Thread-history backfill is ours:
channels' `threadContext.maxMessages` is `0` and `chat/history.ts` prepends
the thread messages the agent has not seen yet.

The agent brain runs on the host. Code execution runs in a per-thread **E2B** sandbox (isolated cloud Linux VM). Model keys, Slack tokens, and DB credentials live on the host and never enter the sandbox.

Storage is **Postgres** for agent memory, gorkie's own tables, and gorkie's
thread state (`lastSeenMessage`, `respondOnThreadMessages`), which lives in
Mastra's `threadState` domain (`chat/state.ts`). Chat SDK state under
`MastraStateAdapter` is in process memory only and does not survive a
restart. Long-term memory uses thread-scoped **Observational Memory**.
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
- Never hand-roll what channels already does (streaming, multi-user prefixes). Control it through `handlers`, `threadContext`, and subscription state. The one exception is history fetch: channels backfills only on the first mention, so `chat/history.ts` does it on every turn.
- Never read `process.env` outside `src/env.ts`, except `DATABASE_URL` in `drizzle.config.ts` (so `drizzle-kit` does not need every bot secret).
- Ask first: dependency changes, schema-shape changes, destructive git operations.
- Every model in `src/mastra/providers.ts` must hold at least 1M input tokens. The orchestrator, `research` and `explore` share one fallback ladder, so a short-context entry does not degrade one agent, it breaks whichever agent happens to fail over onto it mid-thread. Check the context window on models.dev before adding one. The image model (`images.model`, about 131K context) is outside this rule: it only generates images and is not on that ladder. Separately, output caps: `agent.maxTokens.output` (65,536) must stay under the smallest output cap on the agent ladder (131,072, `glm-5.3-flash`), and `summarizer.maxTokens.output` (32,768) under the summarizer ladder's (65,536, `google/gemini-3.5-flash-lite`). The summarizer number is also why Observational Memory overrides Mastra's 100,000 default.
- Never start, restart, or kill `mastra dev`/`mastra start`/the built server on your own initiative. This is a live Slack bot; the user runs it themselves, and two instances running at once share the Mastra scheduler, workers and the DuckDB lock, so scheduled tasks can fire twice and one process loses local traces. If you must verify a code change actually works, ask the user to test it in their own running instance, or use `mastra api` against whatever they already have running instead of launching a new process.

## Coding Rules and Validation

Read and follow [CODING_STANDARDS.md](./CODING_STANDARDS.md) before writing or
modifying code. It is the only list of coding rules, and its "Before calling
work done" section is the validation checklist.

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Skills Discovery](https://mastra.ai/.well-known/skills/index.json)
- [Run and setup guide](./README.md)
