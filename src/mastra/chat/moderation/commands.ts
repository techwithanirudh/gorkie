import type { SlashCommandChannelHandler } from '@mastra/core/channels';
import { z } from 'zod';
import { activeBans } from '../../db/queries/moderation';
import { logger } from '../../lib/logger';
import { banDurationSchema } from '../../types';
import { userMention } from '../message';
import { banGuard, decide } from '.';
import { until } from './cards';
import { isModerator } from './moderators';

// TODO(slopradar): CODING_STANDARDS: no one-use constants | BAN_COMMANDS, UNBAN_COMMANDS and MENTION are each read once (L57, L58, L69) | inline them at the use site
const BAN_COMMANDS = new Set(['/ban', '/dev-ban']);
const UNBAN_COMMANDS = new Set(['/unban', '/dev-unban']);

const MENTION = new RegExp(`^${userMention.source}\\s*(.*)$`, 's');

const rawSchema = z.looseObject({
  response_url: z.url({ hostname: /^hooks\.slack\.com$/ }),
});

async function reply({
  raw,
  text,
}: {
  raw: unknown;
  text: string;
}): Promise<void> {
  const parsed = rawSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn('[moderation] slash command had no response_url');
    return;
  }
  // response_url reaches the invoker privately in any conversation, including
  // ones the bot is not in, which chat.postEphemeral cannot.
  await fetch(parsed.data.response_url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ response_type: 'ephemeral', text }),
  }).catch((error: unknown) =>
    logger.warn('[moderation] could not answer the slash command', { error })
  );
}

async function listBans(): Promise<string> {
  const bans = await activeBans();
  if (bans.length === 0) {
    return 'nobody is banned right now.';
  }
  return bans
    .map(
      ({ userId, expiresAt, reason }) =>
        `• <@${userId}>, ${expiresAt ? `until ${until(expiresAt)}` : 'permanent'}${reason ? `: ${reason}` : ''}`
    )
    .join('\n');
}

export const onSlashCommand: SlashCommandChannelHandler = async (event) => {
  const isBan = BAN_COMMANDS.has(event.command);
  if (!(isBan || UNBAN_COMMANDS.has(event.command))) {
    return;
  }
  const actorId = event.user.userId;
  if (!isModerator(actorId)) {
    await reply({
      raw: event.raw,
      text: 'only gorkie moderators can do that.',
    });
    return;
  }
  const [, userId, rest = ''] = event.text.trim().match(MENTION) ?? [];
  if (!userId) {
    await reply({
      raw: event.raw,
      // TODO(slopradar): CODING_STANDARDS: one canonical union | `[1h|1d|7d|30d|perm]` re-lists banDurationSchema's options by hand | build it from banDurationSchema.options.join('|')
      text: `usage: \`${event.command} @user${isBan ? ' [1h|1d|7d|30d|perm]' : ''} [reason]\`\n\n*active bans*\n${await listBans()}`,
    });
    return;
  }
  const refusal = banGuard({ actorId, userId });
  if (refusal) {
    await reply({ raw: event.raw, text: refusal });
    return;
  }
  if (!isBan) {
    await decide({
      action: 'unban',
      actorId,
      userId,
      reason: rest.trim() || undefined,
    });
    await reply({ raw: event.raw, text: `unbanned <@${userId}>.` });
    return;
  }
  const [first = '', ...words] = rest.trim().split(/\s+/);
  const duration = banDurationSchema.safeParse(first);
  const reason = (duration.success ? words : [first, ...words])
    .join(' ')
    .trim();
  // TODO(slopradar): simplification: duplicated default | the 'perm' fallback is written here twice (L101, L106) and again as decide()'s default (index.ts L61) | compute it once here and drop decide's default
  await decide({
    action: 'ban',
    actorId,
    userId,
    duration: duration.data ?? 'perm',
    reason: reason || undefined,
  });
  await reply({
    raw: event.raw,
    text: `banned <@${userId}> (${duration.data ?? 'perm'}).`,
  });
};
