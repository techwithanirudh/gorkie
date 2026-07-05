# gorkie

gorkie is an AI assistant for Slack. Bun + TypeScript, built on **Mastra** (agent runtime + channels), Chat SDK's Slack adapter in Socket Mode, E2B sandboxes, Postgres, and Langfuse.

## CRITICAL: Load the `mastra` skill first

Load the `mastra` skill BEFORE any Mastra work, and read the embedded docs/source in `node_modules/@mastra/*` rather than guessing. Mastra APIs change between versions; cached knowledge is usually wrong.

## TODO

`TODO.md` is the source of truth for outstanding requests so nothing is forgotten.

- When the user asks for anything: small or large, add it to `TODO.md` immediately, in the right group.
- Tick an item the moment it's done, then remove ticked items (keep them briefly under "Recently completed" so the user can see, then prune).
- Before saying you're finished, re-read `TODO.md` and confirm nothing asked is left unlogged.

## Mental Model

One Mastra `Agent` (`gorkieAgent`) serves Slack through Mastra's built-in `channels`. Channels owns the message flow: Socket Mode, streaming, live tool widgets, typing status, thread-history backfill with multi-user prefixing, and `MastraStateAdapter`. We do not hand-roll any of that, we shape it with channel `handlers` and config.

The agent brain runs on the host. Code execution runs in a per-thread **E2B** sandbox (isolated cloud Linux VM). Model keys, Slack tokens, and DB credentials live on the host and never enter the sandbox.

Storage is **Postgres** (agent memory, channel state). Long-term memory is **Observational Memory**, thread-scoped. Observability traces live in a local **DuckDB** file at the repo root (`observability.duckdb`, wired via `MastraCompositeStore` domain override in `src/mastra/index.ts`, path anchored to `MASTRA_PROJECT_ROOT` so it's the same file under both `mastra dev` and `mastra start`): it works and is the ground truth for debugging what the model actually received and returned. Query it read-only (e.g. `duckdb -readonly`) while the dev server is stopped; DuckDB is single-writer, so a running `mastra dev`/`mastra start` holds the lock. When no server is running, hit `http://localhost:4111/api/observability/traces` on whatever instance the user already has up instead of starting your own (see Boundaries).

## Boundaries

- Never run user/agent code on the host. E2B sandbox only; nothing else touches our OS.
- Never put secrets (model keys, Slack tokens, DB creds) into the sandbox.
- Never hand-roll what channels already does (streaming, history fetch, multi-user prefixes). Control it through `handlers`, `threadContext`, and subscription state.
- Never read `process.env` outside `src/env.ts`.
- Ask first: dependency changes, schema-shape changes, destructive git operations.
- Never start, restart, or kill `mastra dev`/`mastra start`/the built server on your own initiative. This is a live Slack bot; the user runs it themselves, and two instances racing for the same Slack Socket Mode connection causes real, confusing failures. If you must verify a code change actually works, ask the user to test it in their own running instance, or use `mastra api` against whatever they already have running instead of launching a new process.

## Coding Rules

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
3. `bun run start` (smoke test: it should log `[gorkie] online`)

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Skills Discovery](https://mastra.ai/.well-known/skills/index.json)
- Architecture and rationale: [DESIGN.md](./DESIGN.md). Run/setup: [README.md](./README.md).

<!-- BEGIN @agent-native/skills -->
When long-running or parallel work needs usage-limit checks, use the /stay-within-limits skill always.
<!-- END @agent-native/skills -->
