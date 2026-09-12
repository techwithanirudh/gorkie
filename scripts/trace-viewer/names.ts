import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WebClient } from '@slack/web-api';
import { z } from 'zod';
import { env } from '@/env';
import type { Names } from './types';

const CACHE = join(env.MASTRA_PROJECT_ROOT, '.issues/traces/_names.json');

const cached = z
  .object({
    channels: z.record(z.string(), z.string()),
    users: z.record(z.string(), z.string()),
  })
  .catch({ channels: {}, users: {} });

const channelInfo = z.object({
  channel: z
    .object({
      is_im: z.boolean().optional(),
      name: z.string().optional(),
      user: z.string().optional(),
    })
    .optional(),
});

const userInfo = z.object({
  user: z
    .object({
      name: z.string().optional(),
      profile: z.object({ display_name: z.string().optional() }).optional(),
      real_name: z.string().optional(),
    })
    .optional(),
});

export function names(): Names {
  if (!existsSync(CACHE)) {
    return { channels: {}, users: {} };
  }
  return cached.parse(JSON.parse(readFileSync(CACHE, 'utf8')));
}

// Slack throws on ids the bot can no longer see: a channel it was removed
// from, a deactivated user, a DM with a deleted account. One unreachable id
// should leave that name unresolved, not abort the whole walk.
async function call(request: () => Promise<unknown>): Promise<unknown> {
  try {
    return await request();
  } catch {
    return {};
  }
}

async function resolveUser({
  client,
  id,
  into,
}: {
  client: WebClient;
  id: string;
  into: Names;
}): Promise<void> {
  if (into.users[id]) {
    return;
  }
  const body = userInfo.safeParse(
    await call(() => client.users.info({ user: id }))
  );
  const user = body.success ? body.data.user : undefined;
  into.users[id] =
    user?.profile?.display_name || user?.real_name || user?.name || id;
}

// Per id, not `users.list`. This bot lives in a workspace with six figures of
// members, so walking the full member list never finishes, while the traces
// only ever reference a couple of hundred distinct ids.
export async function refresh(ids: {
  channels: string[];
  dmUsers: Record<string, string>;
  users: string[];
}): Promise<Names> {
  const client = new WebClient(env.SLACK_BOT_TOKEN, {
    retryConfig: { retries: 5 },
  });
  const into = names();
  const todo =
    ids.channels.filter((c) => !into.channels[c]).length +
    ids.users.filter((u) => !into.users[u]).length;
  process.stderr.write(`resolving ${todo} slack names\n`);

  let done = 0;
  for (const id of ids.channels) {
    if (into.channels[id]) {
      continue;
    }
    // `conversations.info` on a DM needs `im:read`, which this token does not
    // carry, so a DM is named after the person in it that the traces recorded.
    const dm = ids.dmUsers[id];
    if (dm) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose, Slack rate limits these endpoints and a parallel fan-out just earns 429s
      await resolveUser({ client, id: dm, into });
      into.channels[id] = `@${into.users[dm]}`;
      done++;
      writeFileSync(CACHE, JSON.stringify(into));
      continue;
    }
    const body = channelInfo.safeParse(
      await call(() => client.conversations.info({ channel: id }))
    );
    const channel = body.success ? body.data.channel : undefined;
    into.channels[id] = channel?.name ? `#${channel.name}` : id;
    done++;
    // Written every time: this takes minutes against Slack's rate limits and
    // an interrupted run should not throw away what it already resolved.
    writeFileSync(CACHE, JSON.stringify(into));
    process.stderr.write(`\r${done}/${todo}`);
  }
  for (const id of ids.users) {
    if (into.users[id]) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose, Slack rate limits these endpoints and a parallel fan-out just earns 429s
    await resolveUser({ client, id, into });
    done++;
    writeFileSync(CACHE, JSON.stringify(into));
    process.stderr.write(`\r${done}/${todo}`);
  }
  process.stderr.write('\ndone\n');
  return into;
}

// Some Slack names are built from combining marks that render zero-width, so
// they are stripped everywhere a name is shown: they break both column
// alignment and the box titles that size themselves from the string length.
const plain = (value: string) => value.normalize('NFC').replace(/\p{M}/gu, '');

export const channelName = (n: Names, id: string) =>
  plain(n.channels[id] ?? (id === '?' ? '(no thread)' : id));

export const userName = (n: Names, id: string) => plain(n.users[id] || id);

export function fit(text: string, width: number): string {
  const chars = [...plain(text)];
  if (chars.length <= width) {
    return text + ' '.repeat(width - chars.length);
  }
  return `${chars.slice(0, width - 1).join('')}…`;
}

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

// An ISO timestamp is unreadable at a glance in a list, so show the clock for
// anything recent and a date otherwise, with the year only when it is not
// the current one.
export function when(iso: string): string {
  if (!iso) {
    return '(no date)   ';
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return '(bad date)  ';
  }
  const now = new Date();
  const hour = at.getHours();
  const clock = `${String(hour % 12 || 12).padStart(2, ' ')}:${String(at.getMinutes()).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
  const sameDay = (d: Date) =>
    d.getFullYear() === at.getFullYear() &&
    d.getMonth() === at.getMonth() &&
    d.getDate() === at.getDate();
  if (sameDay(now)) {
    return `today     ${clock}`;
  }
  if (sameDay(new Date(now.getTime() - 86_400_000))) {
    return `yesterday ${clock}`;
  }
  const day = String(at.getDate()).padStart(2, '0');
  if (at.getFullYear() === now.getFullYear()) {
    return `${MONTHS[at.getMonth()]} ${day}    ${clock}`;
  }
  return `${MONTHS[at.getMonth()]} ${day} ${at.getFullYear()}     `;
}
