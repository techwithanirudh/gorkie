# Coding Standards

Project-wide rules for gorkie. These extend the project boundaries in
[AGENTS.md](./AGENTS.md) with the concrete patterns to follow (and avoid)
when writing or refactoring code. Enforced by review and by
`bun run check` (Biome/ultracite) where a rule is mechanically checkable;
the rest is judgment applied consistently.

## Principles

- **Deep modules, minimal interfaces.** A module's public surface should be
  much simpler than its implementation. If a caller has to know internal
  details to use something correctly, the interface is wrong, not the
  caller.
- **The deletion test.** Before extracting a helper, wrapper, or layer, ask:
  if I deleted this, would complexity concentrate somewhere sensible, or
  just move sideways? If it just moves, don't extract it.
- **Validate at boundaries, trust internally.** Parse untrusted input once
  (Slack payloads, tool args, env vars, view state) with Zod, then pass
  typed values through the rest of the call chain without re-checking them.

## Formatting & linting

- Biome (`biome.jsonc`) is the formatter and linter; run `bun run check`
  before considering work done, `bun run check:spelling` for cspell.
- Single quotes, semicolons always, 2-space indent, imports organized on
  save. Don't hand-format against these; let Biome own it.
- Don't add ignore comments (`// biome-ignore`) to silence a rule instead of
  fixing the underlying issue, unless the rule is genuinely wrong for that
  line.

## Types & validation

- No type casts (`as`) to satisfy TypeScript. Narrow the type or parse with
  Zod instead. A cast is only acceptable at a real, already-validated
  external boundary (e.g. a library return type you've confirmed matches).
- Parse all external input with Zod: Slack `private_metadata`, tool
  arguments, webhook payloads, env vars. Never `JSON.parse(...) as T`.
- Shared types live in `src/mastra/types/`, not scattered inline across
  modules. If two files need the same shape, it belongs there.
- When an SDK type carries more fields than a function needs, define a
  smaller internal type and convert at the boundary rather than threading
  the full SDK type through your own code.
- Never fabricate data (empty descriptions, synthetic annotations,
  placeholder schemas) to satisfy a type. That's a signal the type is
  wrong — narrow it instead of working around it.
- When multiple files check the same string-literal union (e.g. a mode or
  permission discriminant), export one named union from a single canonical
  location. Don't re-declare or re-validate the same literals in more than
  one place.

## Function design

- **Dict params.** Any function with more than one parameter takes a
  single options object, not positional args.

  ```ts
  // bad
  logReply(ctxId, author, result, reason);
  // good
  logReply({ ctxId, author, result, reason });
  ```

- **Inline over extract.** Don't create a helper, wrapper, or abstraction
  for something used once. Extract only when a piece of logic is called
  from more than one place, or is genuinely complex enough to need a name
  of its own.
- **No one-use constants.** Inline literals that are only referenced once;
  don't name a value just to use it a single time.
- **Small functions, early returns.** Prefer guard clauses over nested
  conditionals. If a function needs a comment to explain its shape, it
  probably needs to be flattened instead.
- **No large inline closures.** An async closure longer than ~20 lines
  inside an object literal (tool `execute`, event handler, etc.) belongs in
  a named function at module scope with explicit parameter types.

  ```ts
  // bad
  tools[name] = { execute: async (input, opts) => { /* 100 lines */ } };
  // good
  tools[name] = { execute: wrapMCPToolExecute({ ctxId, server, stream }) };
  ```

- **Nested metadata over flat parallel fields.** Fields that always move
  together should be nested, not spread flat.

  ```ts
  // bad
  { serverId: server.id, serverName: server.name, toolName }
  // good
  { server: { id: server.id, name: server.name }, tool: { name: toolName } }
  ```

## Naming

- Direct names. If a wrapper or variable is dead, delete it — don't rename
  it to make it look intentional.
- Name things after what they are, not how they're used in one call site.
  A name that references a specific caller ("used by the summarizer") goes
  stale the moment another caller shows up.
- Names should describe current purpose, not implementation history. Prefer
  `reply`, `turns`, `buildPrompt`, `annotateMentions` over names that trace
  how the code evolved to get here.
- Keep factory naming consistent within a family (e.g. most tool factories
  use `*Tool`). Fix outliers, but never change model-facing tool keys just
  to satisfy a local naming convention.

## Refactoring

Clean by reducing jumps, not by adding architecture. Read the nearby source
before renaming or splitting anything, never from vibes.

- Collapse helpers that only wrap one line or have no real ownership; inline
  them at the call site unless they hide a genuine boundary.
- Split a file only when a module owns a coherent concept of its own (turn
  state, compaction, sandbox setup, Slack mention annotation, tool
  factories, task rendering) — not just because a file got long.
- Keep schemas terse. Add `.describe()` only for fields whose contract
  isn't obvious from the name.
- Type ownership: a private, single-file shape stays inline. A shared or
  exported shape lives in the nearest clear owner's `types/` folder.
  Tool-owned shared shapes live under `types/tools/<tool>.ts`.
- After a rename or file move, search for the old name across source,
  prompts, and docs and update every reference before handoff — stale
  references in prompts are easy to miss and silently wrong at runtime.

**Smells to watch for in this codebase:**

- `index.ts` files that own lifecycle, state, IO, and helpers all at once.
- `create*` / `build*` / `with*` / `resolve*` names hiding a one-line
  operation that could just be inlined.
- Three optional fields on a type where a discriminated union would be
  clearer.
- Long async closures inside tool factories or object literals (see
  [Function design](#function-design)).
- User-facing task or status names that describe internal implementation
  state instead of the action the user took.
- Exported interfaces living in implementation files instead of an owned
  `types/` folder.
- Tool-owned shared types living outside `types/tools/`.

## Comments

- No what-comments and no JSDoc blocks. Well-named identifiers should make
  the "what" obvious.
- Write a comment only when it explains a non-obvious *why*: a hidden
  constraint, a workaround for a specific external bug, an invariant that
  isn't visible from the code itself.
- Don't reference the current task, PR, or issue number in a comment — that
  belongs in the commit message and rots as the code evolves.
- No em dashes anywhere: code, comments, docs, chat replies. Use a comma,
  colon, or period.

## Async & error handling

- Every promise is either `await`ed or explicitly fired-and-forgotten with
  a comment explaining why waiting isn't correct. No silently dropped
  promises.
- No empty or swallowed `catch` blocks. If an error is truly ignorable,
  say why in a comment; otherwise log or rethrow it.
- Don't add error handling, fallbacks, or defensive checks for states that
  can't occur given the code's own guarantees. Validate only at real
  boundaries (user input, external APIs, Slack payloads).

## Config & secrets

- Never read `process.env` outside `src/env.ts`. Every environment
  variable is declared once there with a Zod schema (see the `createEnv`
  block) and imported as `env.WHATEVER` everywhere else.
- Magic numbers or strings that could plausibly change per deployment
  belong in `src/mastra/config.ts`, not inlined at the call site.
- Model keys, Slack tokens, and DB credentials never enter the E2B
  sandbox. They live on the host only.

## Architecture boundaries

These come from [AGENTS.md](./AGENTS.md); repeated here because violating
them is a correctness bug, not a style nit.

- Never run user- or agent-generated code on the host. All execution goes
  through the E2B sandbox.
- Never hand-roll what Mastra `channels` already provides: streaming,
  thread-history backfill, multi-user prefixing, typing status. Shape it
  through `handlers`, `threadContext`, and subscription state instead of
  reimplementing it.
- Ask before: dependency changes, schema-shape changes, destructive git
  operations.

## Slack modal conventions

- `private_metadata` is minimal and Zod-parsed. Persist only what can't be
  re-derived from view state or a DB lookup; parse it with a schema, never
  cast.

  ```ts
  // bad
  const meta = JSON.parse(view.private_metadata || '{}') as SomeMeta;
  // good
  const meta = someMetaSchema.parse(JSON.parse(view.private_metadata || '{}'));
  ```

- Don't scrape `body.view.state.values` to reconstruct a structure just to
  re-render it — that structure should already be in `private_metadata`.
  Only read view state for values the user actively changed in this
  action.
- Every `block_actions` handler that calls `client.views.update` mid-session
  must pass `hash: view.hash`, to avoid clobbering a view a concurrent
  action already updated.
- Check ownership before any DB mutation triggered by a modal action — a
  user should only be able to affect their own resources.

## Before calling work done

1. `bun run fix` (ultracite autofix)
2. `bun run typecheck`
3. `bun run check` and `bun run check:spelling`
4. `bun run start` — should log `[gorkie] online`

For file moves, deleted exports, or public entry points, also `rg` for the
old name across `src/`, `workspace/`, and prompts to catch stale
references before handoff.

If you can't exercise a change through the running bot (Slack-facing
behavior, sandbox interaction), say so explicitly instead of claiming it
works.
