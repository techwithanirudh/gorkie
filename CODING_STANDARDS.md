# Coding Standards

Project-wide rules for gorkie. These extend the project boundaries in
[AGENTS.md](./AGENTS.md) with the concrete patterns to follow and avoid when
writing or refactoring code. Enforced by review and by
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
- Shared or exported types live in `src/mastra/types/`, tool-owned ones
  under `types/tools/<tool>.ts`. A private shape used by one file stays
  inline in that file.
- When an SDK type carries more fields than a function needs, define a
  smaller internal type and convert at the boundary rather than threading
  the full SDK type through your own code.
- Never fabricate data (empty descriptions, synthetic annotations,
  placeholder schemas) to satisfy a type. That's a signal the type is
  wrong, narrow it instead of working around it.
- When multiple files check the same string-literal union (e.g. a mode or
  permission discriminant), export one named union from a single canonical
  location. Don't re-declare or re-validate the same literals in more than
  one place.

## Function design

- **Dict params.** Any function with more than one parameter takes a
  single options object, not positional args, except where a library
  dictates the signature (`guardedFetch(input, init)` mirrors `fetch`,
  `MastraFilesystem` methods are positional).

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
  don't name a value just to use it a single time. A value that could
  plausibly change per deployment is the exception: it goes in
  `src/mastra/config.ts` even when used once (see
  [Config & secrets](#config--secrets)).
- **Small functions, early returns.** Prefer guard clauses over nested
  conditionals. If a function needs a comment to explain its shape, it
  probably needs to be flattened instead.
- **No large inline closures.** An async closure longer than ~20 lines
  inside an object literal (tool `execute`, event handler, etc.) may move to
  a named function at module scope with explicit parameter types, even with
  one caller. This is the only exception to inline over extract; shorter
  one-use helpers stay inline.

  ```ts
  // bad
  tools[name] = { execute: async (input, opts) => { /* 100 lines */ } };
  // good
  tools[name] = { execute: wrapMCPToolExecute({ ctxId, server, stream }) };
  ```

- **No classes** except subclasses a framework requires (a Mastra base
  class, a Chat SDK adapter) and `Error` subclasses. Use functions and
  plain objects otherwise.
- **Nested metadata over flat parallel fields.** Fields that always move
  together should be nested, not spread flat.

  ```ts
  // bad
  { serverId: server.id, serverName: server.name, toolName }
  // good
  { server: { id: server.id, name: server.name }, tool: { name: toolName } }
  ```

## Naming

- Direct names. If a wrapper or variable is dead, delete it, don't rename
  it to make it look intentional.
- Name things after what they are, not how they're used in one call site.
  A name that references a specific caller ("used by the summarizer") goes
  stale the moment another caller shows up.
- Names should describe current purpose, not implementation history. Prefer
  `reply`, `turns`, `buildPrompt`, `annotateMentions` over names that trace
  how the code evolved to get here.
- Module-scope constants are camelCase like any other binding
  (`presets`, `scopeLabels`), never `SCREAMING_CASE`.
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
  factories, task rendering), not just because a file got long.
- Keep schemas terse. Add `.describe()` only for fields whose contract
  isn't obvious from the name.
- After a rename or file move, search for the old name across source,
  prompts, and docs and update every reference before handoff. Stale
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

## Comments

- No what-comments and no JSDoc blocks. Well-named identifiers should make
  the "what" obvious.
- Write a comment only for a vendor or platform fact the code cannot show:
  a library quirk, an API limit, a workaround for a specific external bug.
  The two other allowed comments are the short why on a fire-and-forget
  promise and on an intentionally ignored catch (see
  [Async & error handling](#async--error-handling)). Comments that restate
  intent or narrate the code go.
- Don't reference the current task, PR, or issue number in a comment. That
  belongs in the commit message and rots as the code evolves.
- No em dashes anywhere: code, comments, docs, chat replies. Use a comma
  or a period, never a colon joining the two halves.
- Runtime skills under `workspace/skills/` follow the `unslop` skill on
  dashes: no hyphen or parenthesis standing in for a dash either.

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

- Every environment variable is declared once in `src/env.ts` with a Zod
  schema (the `createEnv` block) and imported as `env.WHATEVER`.
- Magic numbers or strings that could plausibly change per deployment
  belong in `src/mastra/config.ts`, not inlined at the call site. This wins
  over "no one-use constants".

## Architecture boundaries

The boundaries (no host execution, no secrets in the sandbox, `process.env`
only in `src/env.ts`, no hand-rolling what channels does, what to ask
before) live in [AGENTS.md](./AGENTS.md#boundaries). Breaking one is a
correctness bug, not a style nit.

## Tools

Every tool declares a `transform.display` summary, so its Slack widget shows
what happened instead of a generic label, and an `outputSchema` whenever we own
the result shape. Tools that pass through another service's result (the
`agentmail_*` tools proxy AgentMail's MCP server) skip the schema rather than
guess one.

## Slack UI conventions

Messages and modals go through Chat SDK Cards. Raw Block Kit is allowed only
where a Card cannot express the element (confirm dialogs, link buttons).
Modals go through the Chat SDK, not raw Bolt: `event.openModal(...)` from an
action, `bot.onModalSubmit(id, ...)` and `bot.onModalClose(id, ...)` to
handle them, `event.privateMetadata` and `event.values` to read them.

- `privateMetadata` is minimal and Zod-parsed. Persist only what can't be
  re-derived from the submitted values or a DB lookup; parse it with a
  schema, never cast.

  ```ts
  // bad
  const meta = JSON.parse(event.privateMetadata || '{}') as SomeMeta;
  // good
  const meta = someMetaSchema.parse(JSON.parse(event.privateMetadata || '{}'));
  ```

- Parse each `event.values` entry you use with Zod. Only read values the
  user submitted; don't rebuild a structure from them that should already
  be in `privateMetadata`.
- Report field errors by returning `{ action: 'errors', errors }` from the
  submit handler.
- The Chat SDK awaits the submit handler before it answers Slack, which has
  a 3 second window. Don't await slow work (the App Home refresh does DB
  reads and GitHub calls) inside it; fire it with a why-comment.
- App Home is rebuilt from the DB on every `publishHomeView`, so the last
  publish wins; there is no view `hash` to pass.
- Check ownership before any DB mutation triggered by a modal action. A
  user should only be able to affect their own resources.

## Before calling work done

1. `bun run fix` (ultracite autofix)
2. `bun run typecheck`
3. `bun run check` and `bun run check:spelling`
4. Ask the user to test their own running Slack instance when needed.

For file moves, deleted exports, or public entry points, also `rg` for the
old name across `src/`, `workspace/`, and prompts to catch stale
references before handoff.

If you can't exercise a change through the running bot (Slack-facing
behavior, sandbox interaction), say so explicitly instead of claiming it
works.
