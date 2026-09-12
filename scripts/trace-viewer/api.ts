import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { env } from '@/env';
import type { Run, Span } from './types';

const ROOT = env.PROJECT_ROOT;
const INDEX = join(ROOT, '.issues/traces/_runs.json');
const PROJECT = env.MASTRA_PROJECT_ID_PROD ?? env.MASTRA_PROJECT_ID;
const TOKEN =
  env.MASTRA_PLATFORM_ACCESS_TOKEN_PROD ?? env.MASTRA_PLATFORM_ACCESS_TOKEN;
const ORG = env.MASTRA_ORG_ID;

export const permalink = (traceId: string) =>
  ORG
    ? `https://projects.mastra.ai/orgs/${ORG}/projects/${PROJECT}/traces?traceId=${traceId}`
    : `https://projects.mastra.ai/projects/${PROJECT}/traces?traceId=${traceId}`;

const listed = z.object({
  data: z.array(
    z.object({
      endedAt: z.string().nullish(),
      entityId: z.string().nullish(),
      inputPreview: z.string().nullish(),
      metadata: z
        .object({
          resourceId: z.string().nullish(),
          threadId: z.string().nullish(),
        })
        .nullish(),
      name: z.string().nullish(),
      startedAt: z.string().nullish(),
      status: z.string().nullish(),
      traceId: z.string(),
    })
  ),
  page: z.object({ hasMore: z.boolean(), total: z.number() }),
});

async function call(command: string[]): Promise<unknown> {
  const proc = Bun.spawn(
    [join(ROOT, 'node_modules/.bin/mastra'), 'api', 'trace', ...command],
    {
      env: {
        ...process.env,
        MASTRA_PLATFORM_ACCESS_TOKEN: TOKEN,
        MASTRA_PROJECT_ID: PROJECT,
      },
      stderr: 'ignore',
      stdout: 'pipe',
    }
  );
  return JSON.parse(await new Response(proc.stdout).text());
}

const toRun = (row: z.infer<typeof listed>['data'][number]): Run => ({
  agent: row.entityId ?? '',
  endedAt: row.endedAt ?? '',
  preview: (row.inputPreview ?? '').slice(0, 400),
  startedAt: row.startedAt ?? '',
  status: row.status ?? '',
  threadId: row.metadata?.threadId ?? row.traceId,
  traceId: row.traceId,
  user: (row.metadata?.resourceId ?? '').replace('slack:', ''),
});

export async function page(n: number): Promise<{
  hasMore: boolean;
  runs: Run[];
  total: number;
}> {
  const body = listed.parse(
    await call(['list', JSON.stringify({ page: n, perPage: 100 })])
  );
  return {
    hasMore: body.page.hasMore,
    runs: body.data.map(toRun),
    total: body.page.total,
  };
}

export function cached(): Run[] {
  if (!existsSync(INDEX)) {
    return [];
  }
  const parsed = z
    .array(z.custom<Run>())
    .safeParse(JSON.parse(readFileSync(INDEX, 'utf8')));
  return parsed.success ? parsed.data : [];
}

// The list endpoint filters on `entityId` and ignores every other key, so
// there is no server-side text search to lean on. Paging the whole list costs
// about 2 seconds per 100 rows and 739 bytes a row, which is a few megabytes
// for the entire history, so the index is pulled once and searched locally.
export async function sync(
  onProgress: (page: number, pages: number, runs: number) => void
): Promise<Run[]> {
  const known = new Map(cached().map((r) => [r.traceId, r]));
  for (let n = 0; ; n++) {
    // biome-ignore lint/performance/noAwaitInLoops: each page decides whether another is needed, so they cannot be requested up front
    const { hasMore, runs, total } = await page(n);
    const before = known.size;
    for (const run of runs) {
      known.set(run.traceId, run);
    }
    onProgress(n + 1, Math.ceil(total / 100), known.size);
    // A resync only needs to walk back far enough to reach runs it already
    // has, so a routine refresh is one or two pages rather than forty five.
    if (!hasMore || (before > 0 && known.size === before)) {
      break;
    }
  }
  const all = [...known.values()].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt)
  );
  writeFileSync(INDEX, JSON.stringify(all));
  return all;
}

const traceBody = z.object({
  data: z.object({ spans: z.array(z.custom<Span>()) }),
});

// Two layers, because a trace body never changes once the run has ended.
// In memory so arrow-keying down the list does not refetch, and on disk so
// the next session does not either. The on-disk half also picks up whatever
// was pulled by earlier bulk downloads for free.
const loaded = new Map<string, Span[]>();

export async function spans(traceId: string): Promise<Span[]> {
  const already = loaded.get(traceId);
  if (already) {
    return already;
  }
  const path = join(ROOT, '.issues/traces', `${traceId}.json`);
  if (existsSync(path)) {
    const onDisk = traceBody.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    if (onDisk.success) {
      loaded.set(traceId, onDisk.data.data.spans);
      return onDisk.data.data.spans;
    }
  }
  const body = await call(['get', traceId, '--verbose']);
  const parsed = traceBody.safeParse(body);
  const result = parsed.success ? parsed.data.data.spans : [];
  if (parsed.success) {
    writeFileSync(path, JSON.stringify(body));
  }
  loaded.set(traceId, result);
  return result;
}

export async function download(traceId: string): Promise<string> {
  const path = join(ROOT, '.issues/traces', `${traceId}.json`);
  writeFileSync(
    path,
    JSON.stringify(await call(['get', traceId, '--verbose']))
  );
  return path;
}
