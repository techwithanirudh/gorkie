---
name: slopradar
description: "Repo-wide code-quality review: one reviewer agent per scope annotates every rule violation as a TODO(slopradar) comment, then the findings are compiled into SLOPRADAR.md and resolved. Use when the owner asks for a slopradar pass, a slop score, or a whole-codebase quality review."
disable-model-invocation: true
---

# Slopradar

A slopradar pass has three phases: annotate, compile, resolve. It measures code against this repo's own rules (`AGENTS.md`, `CODING_STANDARDS.md`) and the `code-review-and-quality` and `code-simplification` skills. The first pass ran 2026-09-24; `SLOPRADAR.md` and the 2026-09-24 entries in `IMPLEMENTED.md` are its record.

## Phase 1: annotate

Spawn one `general-purpose` agent per scope below, in parallel. Each gets the reviewer brief in `reviewer-brief.md`, with `<SCOPE>`, `<SKILLS>` and `<READS>` filled in from this table. Reviewers only add comments; they change no code.

| Scope | Skills after the two standing ones | Extra reads |
| --- | --- | --- |
| `src/mastra/chat/**` | `chat-sdk`, `mastra` | `docs/webhook-mode.md`, `patches/@chat-adapter+slack@4.41.0.patch` |
| `src/mastra/tools/**` | `mastra` | `docs/brokered-git.md`, `docs/slack-search.md` |
| `src/mastra/{lib,db,server,observability}/**`, `drizzle/**`, `drizzle.config.ts` | `mastra` | `docs/github-app.md`, `docs/slack-thread-ids.md` |
| `src/mastra/{mcp,workspace,processors,memory}/**` | `mastra` | `patches/@mastra+core@1.69.0.patch`, `scripts/verify-mastra-patch.ts` |
| `src/mastra/{agents,prompts,types}/**`, `src/mastra/index.ts`, `src/env.ts`, `src/mastra/config.ts`, `src/mastra/providers.ts`, `scripts/**` | `mastra`, `writing-for-agents` | `.env.example` |
| `workspace/**` (runtime skills), `docs/**`, `README.md`, `AGENTS.md`, `CODING_STANDARDS.md`, `.env.example`, `slack-manifest*.json` | `writing-for-agents`, `unslop` | `TODO.md` (only to avoid re-reporting known items) |

Every reviewer also reads `AGENTS.md`, `CODING_STANDARDS.md`, `biome.jsonc` (its comments explain which rules are off and why) and the security table in `SLOPRADAR.md`.

## Phase 2: compile

Merge the reports into `/SLOPRADAR.md`, replacing the previous pass: a score table per scope (slop 0 to 10, 10 worst, with the count of annotations), the cross-scope patterns, any contradictions inside the rulebook (these go to the owner as questions before cleanup, since every band would otherwise re-argue them), and per scope the systemic patterns, structural verdict, ordered cleanup bands, orphans, and what to keep. Verify every security finding in code before recording it in the security table.

## Phase 3: resolve

1. Owner decisions first. Put each rulebook contradiction and each "change the code or change the rule" finding in `TODO.md` under "Owner decisions from slopradar"; do not resolve those annotations until answered.
2. Resolve the rest band by band, each band one reviewable, behaviour-preserving change: fix, delete the `TODO(slopradar)` comment, and log it in `IMPLEMENTED.md` (file:line, rule, what changed, or why it was declined).
3. Run independent verifier agents over the result. A verifier refutes: it checks each resolution against the rule and the code, and reports regressions. Accept a declined finding only with a written reason.
4. Done means `grep -rn "TODO(slopradar)" src scripts workspace docs` returns nothing and `bun run typecheck`, `bun run check`, `bun run check:spelling` and `bun scripts/verify-mastra-patch.ts` pass.

Follow with `/no-comments` over the resolution diff, and `desloppify` last.
