import type { SlashCommandChannelHandler } from '@mastra/core/channels';
import { z } from 'zod';
import { activeBans } from '../../db/queries/moderation';
import { rawId } from '../../lib/ids';
import { logger } from '../../lib/logger';
import { banDurationSchema } from '../../types';
import { slack } from '../client';
import { userMention } from '../message';
import { decide } from '.';
import { until } from './cards';
import { isModerator } from './moderators';

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
  const isBan = ['/ban', '/dev-ban'].includes(event.command);
  if (!(isBan || ['/unban', '/dev-unban'].includes(event.command))) {
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
  const [, userId, , rest = ''] =
    event.text
      .trim()
      .match(new RegExp(`^${userMention.source}\\s*(.*)$`, 's')) ?? [];
  if (!userId) {
    await reply({
      raw: event.raw,
      text: `usage: \`${event.command} @user${isBan ? ` [${banDurationSchema.options.join('|')}]` : ''} [reason]\`\n\n*active bans*\n${await listBans()}`,
    });
    return;
  }
  let refusal: string | undefined;
  if (rawId(userId) === rawId(actorId)) {
    refusal = "you can't ban yourself.";
  } else if (isModerator(userId)) {
    refusal = "moderators can't be banned. remove them from MODERATORS first.";
  } else if (slack.botUserId && rawId(userId) === slack.botUserId) {
    refusal = "gorkie can't ban itself.";
  }
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
  await reply({ raw: event.raw, text: `banned <@${userId}> (${duration}).` });
};
