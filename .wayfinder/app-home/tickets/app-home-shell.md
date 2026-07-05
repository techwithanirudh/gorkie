---
title: App Home shell — render and wire on Chat SDK
type: prototype
status: open
claimed: false
blocked_by: []
---

## Question

What is the clean rendering + wiring skeleton for App Home on this repo's Chat
SDK stack, that all sections plug into?

Resolve:
- **Home-tab rendering.** `slack.publishHomeView(userId, view)` takes a RAW Block
  Kit view object (Chat SDK JSX has no Home component). Do we hand-build the view
  object, or add `slack-block-builder` (the reference's tool) as a dep? Ask
  before adding a dependency (AGENTS.md). Prototype the header + section layout.
- **Event wiring.** Register `chat.onAppHomeOpened(...)` to publish the home
  view. Where does registration live — extend `registerEvents()` in
  `src/mastra/chat/events.ts`, or a new `src/mastra/chat/app-home/` module that
  `registerEvents` calls? Establish the module boundary the sections will follow.
- **Action/modal routing.** Establish the `chat.onAction` / `chat.onModalSubmit`
  registration pattern and an actionId/callbackId naming convention (reference
  used a central id registry). Sections register their own handlers through it.
- **Republish-on-change.** A helper that rebuilds and re-publishes the home view
  after any mutation (equivalent of the reference `publishHome`).

### Context

- Chat SDK surface (verified): `src/mastra/chat/client.ts` exports `slack`
  (adapter, has `publishHomeView`, `webClient`); `src/mastra/chat/instance.ts`
  exports `chat()` (has `onAppHomeOpened`/`onAction`/`onModalSubmit`/
  `onModalClose`/`onOptionsLoad`).
- Reference shape to mirror: `publish.ts` (`publishHome` → `views.publish`),
  `view/index.ts` (`HomeTab().blocks(...)` with header/context/dividers).
- Docs: `node_modules/chat/docs/{actions,modals,handling-events}.mdx`.
- Sizing consts worth porting: reference `apps/bot/src/config.ts` `appHome`.

Produce: a working "empty" App Home (header + placeholder) that publishes on
open, plus the documented pattern for sections to add blocks + handlers.
