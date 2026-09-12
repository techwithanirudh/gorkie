import { cached, page, permalink, sync } from './api';
import { names, refresh, userName, when } from './names';
import { cleanTitle, group, matches } from './threads';

const flags = process.argv.filter((a) => a.startsWith('--'));
const query = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('--'))
  .join(' ');

let runs = cached();
if (flags.includes('--sync')) {
  runs = await sync((at, pages, seen) =>
    process.stderr.write(`\rsyncing ${at}/${pages}  ${seen} runs`)
  );
  process.stderr.write('\n');
} else if (!runs.length) {
  // One page is two seconds, so a cold start opens on real rows and the
  // viewer fills the rest behind the list.
  ({ runs } = await page(0));
}

if (flags.includes('--names')) {
  const resolved = names();
  await refresh({
    channels: [],
    dmUsers: {},
    users: [...new Set(runs.map((r) => r.user).filter(Boolean))].filter(
      (u) => !resolved.users[u]
    ),
  });
  process.exit(0);
}

const threads = group(runs).filter((t) => matches(t, query));

if (process.stdin.isTTY && !query) {
  const { run } = await import('./viewer');
  await run(runs);
} else {
  const resolved = names();
  for (const thread of threads.slice(0, 60)) {
    process.stdout.write(
      `${thread.errors ? '!' : ' '} ${when(thread.last)}  ${userName(resolved, thread.users[0] ?? '-').padEnd(16)} ${String(thread.runs.length).padStart(3)}t  ${cleanTitle(thread.title).slice(0, 64)}\n`
    );
    if (flags.includes('--full')) {
      for (const turn of thread.runs) {
        process.stdout.write(
          `    ${when(turn.startedAt)}  ${permalink(turn.traceId)}\n`
        );
      }
    }
  }
  process.stdout.write(
    `\n${threads.length} thread(s)${query ? ` matching "${query}"` : ''}\n`
  );
}
