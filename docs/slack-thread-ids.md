# Slack-shaped memory thread ids

Gorkie's memory threads used to get a random UUID as their id. The
orchestrator now sets channels' `resolveThreadId: ({ thread }) => thread.id`,
so a new thread is stored under its Chat SDK id, `slack:<channel>:<ts>`. That
is the id every other part of Gorkie already uses: the E2B sandbox key,
Langfuse `sessionId`, thread state and request context.

`resolveThreadId` only shapes new threads. Mastra finds an existing thread by
its `channel_externalThreadId` metadata before it would create one, so old
threads keep working but keep their UUIDs. The drizzle migration
`drizzle/20260924024825_slack_memory_thread_ids` renames them, so the database
ends up with one id shape.

## What the migration changes

In one transaction, for every thread whose metadata has
`channel_platform = 'slack'` and a `channel_externalThreadId`:

- `mastra_threads.id` becomes the Slack id.
- Every text column named `threadId`, `thread_id` or `sourceThreadId` in a
  `mastra_*` table follows. Today that covers messages, observational memory,
  thread state, background tasks, notifications, harness sessions, scorers,
  knowledge tables and, if they are in Postgres, observability spans.
- `mastra_observational_memory."lookupKey"` goes from `thread:<uuid>` to
  `thread:<slack id>`.
- The old id is replaced wherever it appears as a whole JSON string in
  `mastra_schedules.target` (where `wait` and scheduled tasks keep their
  thread), `mastra_schedules.metadata`, `mastra_threads.metadata` and
  `mastra_workflow_snapshot.snapshot`.

It skips:

- tables that do not exist, such as on a fresh database.
- threads without a Slack id, such as Studio threads.
- threads claimed by an agent other than `orchestrator`.
- a thread whose Slack id already belongs to another thread.

When several threads share one Slack id, it renames the one Mastra's
`findThreadMapping` would pick. The others were already unreachable and stay as
they are.

Chat SDK state (subscriptions, `thread-state:` keys) is keyed by the Chat SDK id
already, so it does not change.

## Deploying

1. Stop the bot. Nothing may write to these tables during the rename, and two
   instances fighting over one Socket Mode connection fail in confusing ways.
2. Back up the database. There is no down migration:

   ```sh
   pg_dump --format=custom --file=gorkie-before-thread-ids.dump "$DATABASE_URL"
   ```

3. Optionally, run the dry run below to see how many rows will change.
4. Deploy and start the new build. `runMigrations()` in `src/mastra/db/index.ts`
   first runs Mastra's own table setup, then applies the migration on boot.
   `bun run db:migrate` also works, with the bot still stopped.
5. Check the log for a clean start, then mention Gorkie in an existing thread.
   It should remember the conversation.

To roll back, stop the bot, restore the dump with
`pg_restore --clean --if-exists -d "$DATABASE_URL" gorkie-before-thread-ids.dump`,
and deploy the previous build.

## Dry run

These queries only read. Run them in `psql` against the database before
deploying:

```sql
-- Threads that will be renamed (same selection as the migration).
-- WITH map AS (
--   SELECT DISTINCT ON (t.meta ->> 'channel_externalThreadId')
--     t.id AS old_id, t.meta ->> 'channel_externalThreadId' AS new_id
--   FROM (SELECT id, "createdAt", metadata::jsonb AS meta FROM mastra_threads) t
--   WHERE t.meta ->> 'channel_platform' = 'slack'
--     AND coalesce(t.meta ->> 'channel_externalThreadId', '') <> ''
--     AND t.id <> t.meta ->> 'channel_externalThreadId'
--     AND coalesce(t.meta ->> 'channel_ownerId', 'orchestrator') = 'orchestrator'
--     AND NOT EXISTS (
--       SELECT 1 FROM mastra_threads x
--       WHERE x.id = t.meta ->> 'channel_externalThreadId'
--     )
--   ORDER BY t.meta ->> 'channel_externalThreadId',
--     (t.meta ? 'channel_ownerId') DESC,
--     CASE WHEN t.meta ? 'channel_ownerId' THEN t."createdAt" END DESC,
--     t."createdAt" ASC
-- )
-- SELECT
--   (SELECT count(*) FROM map) AS threads,
--   (SELECT count(*) FROM mastra_messages m JOIN map ON m.thread_id = map.old_id) AS messages,
--   (SELECT count(*) FROM mastra_observational_memory o JOIN map ON o."threadId" = map.old_id) AS observational_memory,
--   (SELECT count(*) FROM mastra_schedules s JOIN map ON s.target ->> 'threadId' = map.old_id) AS schedules;
```

Uncomment and run it. Drop a subquery if its table does not exist yet. Also
check which Mastra columns the migration will find:

```sql
-- SELECT table_name, column_name
-- FROM information_schema.columns
-- WHERE table_schema = current_schema()
--   AND table_name LIKE 'mastra\_%'
--   AND column_name IN ('threadId', 'thread_id', 'sourceThreadId')
-- ORDER BY 1, 2;
```

## Not covered

- Message bodies (`mastra_messages.content`) are not searched. They hold what
  was said, not references Mastra resolves by thread id.
- Semantic recall vector tables (`metadata->>'thread_id'`) are not touched.
  Recall is disabled and Gorkie creates no vector index.
- Subagent threads live in an in-memory store, so none are in Postgres.
