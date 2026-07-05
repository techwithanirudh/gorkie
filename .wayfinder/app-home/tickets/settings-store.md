---
title: Per-user App Home settings store
type: grilling
status: open
claimed: false
blocked_by: []
---

## Question

Where and how do we persist per-user App Home settings, and what is the shape?

The settings object (one row per Slack user):
- `instructions: string | null` — custom instructions text.
- `statsForNerds: boolean` — show per-turn token usage in the footer.
- `showTaskCards: boolean` — show verbose tool cards vs compact status only.

Decide the persistence mechanism and write the read/write access. This blocks
every ticket that reads or writes settings, so it is foundational.

### Context

- The reference used a Drizzle table `user_customizations` (prompt only):
  `../worktrees/gorkie-slack/reference/packages/db/src/schema/customizations.ts`
  and `.../queries/customizations.ts` (`getUserCustomization`,
  `setUserCustomization`, `clearUserCustomization`).
- This repo stores on **Postgres via `@mastra/pg`** (`env.DATABASE_URL`). FIRST
  determine the existing DB access pattern: read
  `src/mastra/tools/scheduled-tasks/queries.ts` and `utils.ts` — does this repo
  use Drizzle, raw SQL, or a Mastra store API? Match it; do not introduce a new
  ORM. Ask before any schema-shape change (AGENTS.md rule).
- Consider whether Mastra resource-scoped memory / working memory is a better
  fit than a bespoke table (load the `mastra` skill, check
  `node_modules/@mastra/*`). Weigh against the fact that settings must be read
  both at App Home render time AND mid-turn (see settings-runtime-read).
- Keep the value shape stable and serializable so instruction-injection can be
  made cache-safe (see instruction-injection).

### Persistence options (researched 2026-07-05 — no Drizzle needed)

- **Route A (recommended): reuse Mastra's pg pool, plain SQL.** `PostgresStore`
  (`@mastra/pg`) exposes `get pool()` / `get db()` — a raw `pg` pool. Run a
  one-time idempotent `CREATE TABLE IF NOT EXISTS user_settings (...)` at boot +
  parameterized upsert/select, validate rows with Zod at the boundary. No ORM, no
  migration tool. Open detail to settle: how to get the pool handle — reach the
  composite store's default `PostgresStore.pool` in `src/mastra/index.ts`, vs a
  dedicated `PostgresStore`/`pg.Pool` in a small `src/mastra/lib/db.ts` (keep the
  `env.DATABASE_URL` read via `src/env.ts` per AGENTS.md).
- **Route B (rejected): resource-scoped working memory.** `Memory` supports
  `workingMemory: { scope: 'resource', schema }` — zero-setup per-user store in
  `mastra_resources`. But it is LLM-managed and injected into every prompt →
  busts the prompt cache and lets the model rewrite toggles. Wrong fit for
  settings.
- **Route C (rejected): Mastra generic `StoreOperations` (`createTable`/`insert`/
  `load`).** Typed to a fixed `TABLE_NAMES` enum of Mastra's own tables; a custom
  table needs a type cast, which AGENTS.md forbids.
- **No Mastra plugin/extension system exists** (checked source): Config slots and
  composite-store `domains` are both closed sets of Mastra's own interfaces — you
  can swap a domain's backend (repo does this for observability→DuckDB) but
  cannot register a custom "settings" domain. So Route A is the honest path.
- **Cleaner shape for Route A (recommended):** one `jsonb` column per user
  (`user_settings(user_id text pk, settings jsonb, updated_at)`), schema-on-read
  with a single Zod object (`instructions/statsForNerds/showTaskCards`, with
  `.default()`s). Adding a future toggle = one Zod field, zero migrations, no
  `ALTER TABLE`. `pg` is already present transitively via `@mastra/pg` — no new
  dep. (A typed query builder like Kysely is the only "cleaner" alternative and
  would be a new dependency → ask first.)
- Note the repo precedent: scheduled tasks use Mastra's `heartbeats` service (not
  a custom table), scoped by `resourceId` (the Slack user). Follow that instinct
  — lean on primitives — but for plain settings, Route A is the honest fit.

Produce: the chosen store (default: Route A), the `CREATE TABLE` + typed get/set
helpers (single options-object params, types in `src/mastra/types/`), keyed by
Slack user id.
