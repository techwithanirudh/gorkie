import type { Run, Thread } from './types';

export function cleanTitle(text: string): string {
  const decoded = text
    .replace(/^\{"contents":"/, '')
    .replace(/\\+n/g, ' ')
    .replace(/\\+"/g, '"')
    .replace(/\\+/g, '');
  let out = decoded.split('","')[0].trim();
  while (/^[[(]/.test(out)) {
    const next = out.replace(/^\[[^\]]*\]\s*/, '').replace(/^\([^)]*\)\s*/, '');
    if (next === out) {
      break;
    }
    out = next;
  }
  out = out
    .replace(/\s*\(<?@?[UBW][A-Z0-9]{6,}>?\)/g, '')
    .replace(/^@\S+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^\[/.test(out)) {
    return '(history replay)';
  }
  return out || '(no preview)';
}

export function group(runs: Run[]): Thread[] {
  const byThread = new Map<string, Run[]>();
  for (const run of runs) {
    byThread.set(run.threadId, [...(byThread.get(run.threadId) ?? []), run]);
  }
  return [...byThread.entries()]
    .map(([id, unsorted]) => {
      const sorted = [...unsorted].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt)
      );
      return {
        errors: sorted.filter((r) => r.status && r.status !== 'success').length,
        id,
        last: sorted[0]?.startedAt ?? '',
        runs: sorted,
        // The oldest turn carrying a real request, so a thread that opened
        // with replayed history still gets a title worth reading.
        title:
          [...sorted]
            .reverse()
            .map((r) => cleanTitle(r.preview))
            .find((t) => t !== '(history replay)' && t !== '(no preview)') ??
          '(history replay)',
        users: [...new Set(sorted.map((r) => r.user).filter(Boolean))],
      };
    })
    .sort((a, b) => b.last.localeCompare(a.last));
}

export function matches(thread: Thread, query: string): boolean {
  const wanted = query.toLowerCase().trim();
  if (!wanted) {
    return true;
  }
  const link = /\/archives\/[CDG][A-Z0-9]+\/p(\d{10})(\d{6})/.exec(query);
  const hay =
    `${thread.id} ${thread.users.join(' ')} ${thread.title} ${thread.runs
      .map((r) => `${r.traceId} ${r.preview} ${r.agent}`)
      .join(' ')}`.toLowerCase();
  if (link) {
    return hay.includes(`${link[1]}.${link[2]}`);
  }
  return wanted.split(/\s+/).every((term) => hay.includes(term));
}
