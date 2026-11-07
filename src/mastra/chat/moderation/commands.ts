import type { SlashCommandChannelHandler } from '@mastra/core/channels';
import { z } from 'zod';
import { limitWindowHours } from '../../config';
import { activeBans } from '../../db/queries/moderation';
import { isUserAllowed } from '../../lib/allowed-users';
import { overLimit } from '../../lib/limits';
import { logger } from '../../lib/logger';
import { banDurationSchema } from '../../types';
import { slack } from '../client';
import { until } from './cards';
import { isBanned } from './gate';
import { decide } from './index';
import { isModerator } from './moderators';

const rawSchema = z.looseObject({
  response_url: z.url({ hostname: /^hooks\.slack\.com$/ }),
});

// Slack adds the |name when the text was escaped, as it does with should_escape.
const target = /^<@([UW][A-Z0-9]+)(?:\|[^>]*)?>\s*(.*)$/s;

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
    return 'Nobody is banned right now.';
  }
  return bans
    .map(
      ({ userId, expiresAt, reason }) =>
        `• <@${userId}>, ${expiresAt ? `until ${until(expiresAt)}` : 'permanent'}${reason ? `: ${reason}` : ''}`
    )
    .join('\n');
}

export const onSlashCommand: SlashCommandChannelHandler = async (
  event,
  defaultHandler
) => {
  const isBan = ['/ban', '/gorkie-dev-ban'].includes(event.command);
  const isUnban = ['/unban', '/gorkie-dev-unban'].includes(event.command);
  const actorId = event.user.userId;
  if (!(isBan || isUnban)) {
    // defaultHandler runs a full agent turn, so it gets the same gates as a
    // mention: banned or not opted in gets nothing, and it counts against the
    // token limit.
    if ((await isBanned(actorId)) || !(await isUserAllowed(actorId))) {
      await reply({ raw: event.raw, text: "You can't use Gorkie right now." });
      return;
    }
    if (await overLimit({ kind: 'tokens', userId: actorId })) {
      await reply({
        raw: event.raw,
        text: `You've hit your ${limitWindowHours}-hour usage limit. See \`!limits\`, and try again later.`,
      });
      return;
    }
    await defaultHandler();
    return;
  }
  if (!isModerator(actorId)) {
    await reply({
      raw: event.raw,
      text: 'Only Gorkie moderators can do that.',
    });
    return;
  }
  const [, userId, rest = ''] = event.text.trim().match(target) ?? [];
  if (!userId) {
    await reply({
      raw: event.raw,
      text: `Usage: \`${event.command} @user${isBan ? ` [${banDurationSchema.options.join('|')}]` : ''} [reason]\`\n\n*Active bans*\n${await listBans()}`,
    });
    return;
  }
  let refusal: string | undefined;
  if (userId === actorId) {
    refusal = "You can't ban yourself.";
  } else if (isModerator(userId)) {
    refusal = "Moderators can't be banned. Remove them from MODERATORS first.";
  } else if (slack.botUserId && userId === slack.botUserId) {
    refusal = "Gorkie can't ban itself.";
  }
  if (refusal) {
    await reply({ raw: event.raw, text: refusal });
    return;
  }
  if (isUnban) {
    await decide({
      action: 'unban',
      actorId,
      userId,
      reason: rest.trim() || undefined,
    });
    await reply({ raw: event.raw, text: `Unbanned <@${userId}>.` });
    return;
  }
  const [first = '', ...words] = rest.trim().split(/\s+/);
  const parsed = banDurationSchema.safeParse(first);
  const duration = parsed.data ?? 'perm';
  const reason = (parsed.success ? words : [first, ...words]).join(' ').trim();
  await decide({
    action: 'ban',
    actorId,
    userId,
    duration,
    reason: reason || undefined,
  });
  await reply({ raw: event.raw, text: `Banned <@${userId}> (${duration}).` });
};
