---
title: Cache-safe per-user instruction injection
type: research
status: open
claimed: false
blocked_by: [settings-store]
---

## Question

How do we feed a user's stored custom instructions into the agent for their
turns WITHOUT busting the prompt cache?

This is the crux the user called out: naively appending per-user text into the
system prompt changes the cached prefix every time the user differs, destroying
cache hits and inflating cost/latency. Find the cache-safe injection point.

Investigate and decide:
- Where does Mastra place the cache breakpoint(s) relative to system
  instructions, memory, and messages? Dig into `node_modules/@mastra/*` (load
  the `mastra` skill first — cached knowledge is wrong). Look at how the agent's
  `instructions` (static vs dynamic function) and Memory (`observationalMemory`,
  `lastMessages`) map onto the provider request, and where Anthropic prompt-cache
  `cache_control` breakpoints get set.
- Cross-check Anthropic prompt-caching rules via the `claude-api` skill: a cache
  hit needs a byte-identical prefix; anything user-varying must sit AFTER the
  last cached breakpoint (e.g. injected as a trailing message or a post-breakpoint
  segment), or be its own separately-cached block.
- Options to weigh: (a) keep the big static system prompt as the stable cached
  prefix and inject per-user instructions as a trailing user/system message after
  the breakpoint; (b) a per-user cached segment; (c) Mastra memory/working-memory
  as the carrier. Confirm which the runtime actually caches well.

### Context

- Agent + prompt pipeline: `src/mastra/agents/gorkie.ts` (instructions),
  `src/mastra/prompts/` (`core.ts`, `personality.ts`, `guardrails.ts`,
  `index.ts`, `tools.ts`).
- Reference (Bolt) injected the user prompt into the system prompt directly with
  no cache concern — do NOT copy that naively.
- Depends on settings-store for the read path; the acting-user resolution during
  a turn overlaps with settings-runtime-read (coordinate, don't duplicate).

Produce: a written recommendation (the summary asset) with the chosen injection
point and why it preserves cache hits, ready to implement in custom-instructions.
