---
label: wayfinder:map
title: App Home for the Mastra gorkie
---

# Map: App Home for the Mastra gorkie

Bring Slack App Home into the Mastra-based gorkie codebase, cleanly and with
customizations. Port the reference bot's App Home (a Bolt app) onto this repo's
Chat-SDK-owned stack.

## Notes

**Domain.** Slack App Home tab = a per-user home surface published via
`views.publish`. In this repo it is served through the Chat SDK Slack adapter,
not Bolt.

**v1 scope (decided with user):** two sections + three customizations.
- Section: **Custom Instructions** (per-user, simple modal, no preset library).
- Section: **Scheduled Tasks** (list + cancel).
- Customization: **Stats for nerds** toggle — show per-turn token usage in the
  "gorkie may make mistakes" completion footer.
- Customization: **Task cards show/hide** toggle — when hidden, suppress the
  verbose tool-activity cards and show only a compact status block.
- Custom instructions are **per-user**.
- Hard constraint (user): injecting per-user instructions must **not bust the
  prompt cache**.

**Settled mechanism (research, do not re-litigate):** Chat SDK's Slack adapter
has native App Home support. Build on these, not Bolt:
- `chat.onAppHomeOpened(handler)` — home opened event.
- `slack.publishHomeView(userId, view)` — `views.publish` wrapper; `view` is a
  raw Block Kit object (Chat SDK JSX has NO Home component, only Modal/Card).
- `chat.onAction(ids, handler)`, `chat.onModalSubmit(ids, handler)`,
  `chat.onModalClose`, `chat.onOptionsLoad` — button/modal handlers; modals are
  Chat SDK JSX (`Modal`/`Section`/`Header`/`Divider`/`Actions`/`Input`).
- `slack.webClient` — raw `@slack/web-api` escape hatch.
- Handlers register alongside `registerEvents()` in `src/mastra/chat/events.ts`;
  `slack` (adapter) and `chat()` (Chat instance) come from
  `src/mastra/chat/{client,instance}.ts`.

**Skills to consult every session:** `mastra` (BEFORE any Mastra work — read
`node_modules/@mastra/*` source, do not guess), `coding-best-practices`,
`claude-api` (for prompt-caching questions). Chat SDK docs live at
`node_modules/chat/docs/{modals,actions,cards,handling-events}.mdx`.

**Reference codebase (Bolt, read-only):**
`../worktrees/gorkie-slack/reference/apps/bot/src/slack/`
- Event: `events/app-home-opened/index.ts`
- Publish + view: `features/customizations/publish.ts`, `.../view/index.ts`,
  `.../view/_components/{custom-instructions,scheduled-tasks}.ts`
- Persistence: `../worktrees/gorkie-slack/reference/packages/db/src/{schema,queries}/customizations.ts`
- Sizing consts: `.../apps/bot/src/config.ts` (`appHome`)

## Decisions so far

<!-- one line per closed ticket -->

## Fog

- **MCP servers section** — the reference's third section. The new codebase has
  ZERO MCP support, so this needs an entire MCP foundation (OAuth + bearer auth,
  tool modes, approval, search, persistence) before any App Home work. Deferred
  out of v1; may become its own map later.
- **Other customizations floated but not chosen** — persona/personality toggle
  (`src/mastra/prompts/personality.ts` exists), model selection, memory
  viewer/reset. Left in fog as possible v2 sections.
- **Multi-workspace / token scoping** — `publishHomeView` and per-user reads may
  need per-tenant token scoping if gorkie ever runs multi-workspace. Single
  workspace assumed for now; revisit if that changes.
- **Usage-data source** — if per-turn token counts are not already on the object
  the footer processor sees, where they come from (stream usage vs observability
  trace) is a sub-question that will sharpen inside the stats-for-nerds ticket.
