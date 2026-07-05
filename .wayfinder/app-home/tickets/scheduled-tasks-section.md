---
title: Scheduled Tasks section
type: task
status: open
claimed: false
blocked_by: [app-home-shell]
---

## Question

Port the Scheduled Tasks section: list the acting user's active scheduled tasks
(prompt, cron, timezone, destination, next/last run) with a Cancel button per
task (with confirm) that deletes and republishes.

Build:
- A "list scheduled tasks for this user" read. The reference used
  `listScheduledTasksByUser(userId)`. This repo has task queries in
  `src/mastra/tools/scheduled-tasks/` — FIRST check whether a per-user list query
  exists (`queries.ts`, `list.ts`); reuse it, or add one matching the existing
  DB pattern. No new persistence needed (tasks already persist).
- Home section rendering (list + empty state), mirroring reference layout:
  `../worktrees/gorkie-slack/reference/apps/bot/src/slack/features/customizations/view/_components/scheduled-tasks.ts`
  (uses `date-fns` for next/last-run relative times — confirm/add dep if needed).
- Cancel action → delete via `src/mastra/tools/scheduled-tasks/delete.ts` path →
  republish. Reuse ownership checks (`canManageTask`/`findOwnedTask` in
  `queries.ts`) so a user can only cancel their own tasks.

### Context

- Rendering + handler registration pattern comes from app-home-shell.
- Independent of settings-store (no per-user setting involved).

Produce: a working Scheduled Tasks section that lists and cancels the acting
user's tasks.
