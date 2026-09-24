-- drizzle runs all pending migrations in one transaction, so this is atomic.
DO $$
DECLARE
  col record;
  changed bigint;
BEGIN
  IF to_regclass('mastra_threads') IS NULL THEN
    RETURN;
  END IF;

  -- Mirrors findThreadMapping's pick when several threads share one Slack id:
  -- one claimed by the orchestrator (newest first), else an unclaimed one
  -- (oldest first). Threads claimed by another agent are never picked there.
  CREATE TEMP TABLE gorkie_thread_id_map ON COMMIT DROP AS
  SELECT DISTINCT ON (t.meta ->> 'channel_externalThreadId')
    t.id AS old_id,
    t.meta ->> 'channel_externalThreadId' AS new_id
  -- Older databases may hold metadata as text; Mastra casts it the same way.
  FROM (
    SELECT id, "createdAt", metadata::jsonb AS meta FROM mastra_threads
  ) t
  WHERE t.meta ->> 'channel_platform' = 'slack'
    AND coalesce(t.meta ->> 'channel_externalThreadId', '') <> ''
    AND t.id <> t.meta ->> 'channel_externalThreadId'
    AND coalesce(t.meta ->> 'channel_ownerId', 'orchestrator') = 'orchestrator'
  ORDER BY
    t.meta ->> 'channel_externalThreadId',
    (t.meta ? 'channel_ownerId') DESC,
    CASE WHEN t.meta ? 'channel_ownerId' THEN t."createdAt" END DESC,
    t."createdAt" ASC;

  DELETE FROM gorkie_thread_id_map m
  USING mastra_threads t
  WHERE t.id = m.new_id;

  IF NOT EXISTS (SELECT 1 FROM gorkie_thread_id_map) THEN
    RETURN;
  END IF;
  CREATE UNIQUE INDEX ON gorkie_thread_id_map (old_id);

  -- (threadId, type) is the primary key: keep a row already under the Slack id.
  IF to_regclass('mastra_thread_state') IS NOT NULL THEN
    -- TODO(slopradar): review: correctness | a thread_state row whose type already exists under the Slack id stays under old_id, and old_id is renamed away in mastra_threads below, so the row is orphaned for good | after this UPDATE, DELETE FROM mastra_thread_state s USING gorkie_thread_id_map m WHERE s."threadId" = m.old_id
    UPDATE mastra_thread_state s
    SET "threadId" = m.new_id
    FROM gorkie_thread_id_map m
    WHERE s."threadId" = m.old_id
      AND NOT EXISTS (
        SELECT 1 FROM mastra_thread_state x
        WHERE x."threadId" = m.new_id AND x.type = s.type
      );
  END IF;

  FOR col IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name LIKE 'mastra\_%'
      AND c.table_name NOT IN ('mastra_threads', 'mastra_thread_state')
      AND c.column_name IN ('threadId', 'thread_id', 'sourceThreadId')
      AND c.data_type IN ('text', 'character varying')
  LOOP
    EXECUTE format(
      'UPDATE %1$I t SET %2$I = m.new_id FROM gorkie_thread_id_map m WHERE t.%2$I = m.old_id',
      col.table_name,
      col.column_name
    );
  END LOOP;

  -- Thread-scoped observational memory is looked up by "thread:<id>".
  IF to_regclass('mastra_observational_memory') IS NOT NULL THEN
    UPDATE mastra_observational_memory o
    SET "lookupKey" = 'thread:' || m.new_id
    FROM gorkie_thread_id_map m
    WHERE o."lookupKey" = 'thread:' || m.old_id;
  END IF;

  -- Only whole JSON strings are replaced, so a UUID that merely prefixes a
  -- subagent thread id is left alone. One pass replaces one id per row, so
  -- repeat until clean.
  FOR col IN
    SELECT c.table_name, c.column_name, c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND (c.table_name, c.column_name) IN (
        ('mastra_schedules', 'target'),
        ('mastra_schedules', 'metadata'),
        ('mastra_threads', 'metadata'),
        ('mastra_workflow_snapshot', 'snapshot')
      )
      AND c.udt_name IN ('json', 'jsonb', 'text')
  LOOP
    LOOP
      EXECUTE format(
        'UPDATE %1$I t SET %2$I = replace(t.%2$I::text, %3$L || m.old_id || %3$L, %3$L || m.new_id || %3$L)::%4$s FROM gorkie_thread_id_map m WHERE strpos(t.%2$I::text, %3$L || m.old_id || %3$L) > 0',
        col.table_name,
        col.column_name,
        '"',
        col.udt_name
      );
      GET DIAGNOSTICS changed = ROW_COUNT;
      EXIT WHEN changed = 0;
    END LOOP;
  END LOOP;

  UPDATE mastra_threads t
  SET id = m.new_id
  FROM gorkie_thread_id_map m
  WHERE t.id = m.old_id;
END $$;
