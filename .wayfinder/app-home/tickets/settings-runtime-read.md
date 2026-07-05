---
title: Read per-user settings at render time
type: research
status: open
claimed: false
blocked_by: [settings-store]
---

## Question

How do the render-time consumers get the acting user's settings during a live
turn?

The two toggle customizations need the acting Slack user's settings while a turn
is being rendered:
- The completion footer in `src/mastra/processors/turns.ts` (for stats-for-nerds).
- The tool-display function in `src/mastra/chat/tool-display.ts` (for task-cards).

Find where the acting user id is available in each path and how to load their
settings there (without an N+1 per tool event — cache per turn if needed).

### Context

- Footer: `src/mastra/processors/turns.ts:67` posts the "gorkie may make
  mistakes" footer. Determine what user/thread/usage context the processor
  receives.
- Tool display: `src/mastra/chat/tool-display.ts` exports a `ToolDisplayFn`
  (`ToolDisplayFn` from `@mastra/core/channels`). Determine whether the `event`
  it receives carries the acting user / resourceId; if not, find how per-user
  context reaches it (channels wiring in `src/mastra/agents/gorkie.ts`). Load the
  `mastra` skill and read the channels source — this is the risky unknown.
- Overlaps with instruction-injection on "resolve acting user during a turn";
  share the resolution helper rather than writing it twice.
- Settings come from settings-store.

Produce: a small helper (or documented access path) that yields
`{ statsForNerds, showTaskCards }` for the acting user inside both the footer
processor and the tool-display function, proven to fire with the right user.
