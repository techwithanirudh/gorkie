import { join } from 'node:path';
import { DuckDBStore } from '@mastra/duckdb';
import { env } from '@/env';
import { observability as config } from './config';
import { logger } from './lib/logger';

// DuckDB is single-writer: a second process holding the file lock must not
// take the bot down with it, it just runs without local traces.
export const traceStore =
  env.NODE_ENV === 'production'
    ? undefined
    : await new DuckDBStore({
        path: join(env.PROJECT_ROOT, 'observability.duckdb'),
      })
        .getStore('observability')
        .then(async (store) => {
          await store?.init();
          return store;
        })
        .catch((error: unknown) => {
          logger.error('[observability] local trace store failed to open', {
            error,
          });
        });

if (traceStore) {
  const prune = () =>
    traceStore
      .prune({
        logs: { maxAge: config.traceRetention },
        metrics: { maxAge: config.traceRetention },
        scores: { maxAge: config.traceRetention },
        spans: { maxAge: config.traceRetention },
      })
      .catch((error: unknown) => {
        logger.warn('[observability] pruning old traces failed', { error });
      });
  // Not awaited: pruning is housekeeping and must not hold up boot.
  prune();
  setInterval(prune, config.pruneIntervalMs).unref();
}
