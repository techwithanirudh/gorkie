import { activeBans } from '../../db/queries/moderation';
import {
  banDurationSchema,
  type ModerationAction,
  type SharedCommand,
  slackUserIdSchema,
} from '../../types';
import { slack } from '../client';
import { until } from './cards';
import { isModerator } from './gate';
import { decide } from './index';

// Slack adds the |name when the text was escaped, as it does with should_escape.
const target = /^<@([^|>]+)(?:\|[^>]*)?>\s*(.*)$/s;

export const moderationUsage = {
  ban: '@user [90m|12h|6.5d|2w|perm] [reason]',
  unban: '@user [reason]',
};

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

export const bans: SharedCommand = async ({ userId }) =>
  isModerator(userId)
    ? `*Active bans*\n${await listBans()}`
    : 'Only Gorkie moderators can do that.';

function moderate(action: ModerationAction): SharedCommand {
  return async ({ args, prefix, userId: actorId }) => {
    if (!isModerator(actorId)) {
      return 'Only Gorkie moderators can do that.';
    }
    const [, mention, rest = ''] = args.match(target) ?? [];
    const userId = slackUserIdSchema.safeParse(mention).data;
    if (!userId) {
      return `Usage: \`${prefix}${action} ${moderationUsage[action]}\``;
    }
    if (userId === actorId) {
      return "You can't ban yourself.";
    }
    if (isModerator(userId)) {
      return "Moderators can't be banned. Remove them from MODERATORS first.";
    }
    if (slack.botUserId && userId === slack.botUserId) {
      return "Gorkie can't ban itself.";
    }
    if (action === 'unban') {
      await decide({
        action,
        actorId,
        userId,
        reason: rest.trim() || undefined,
      });
      return `Unbanned <@${userId}>.`;
    }
    const [first = '', ...words] = rest.trim().split(/\s+/);
    const parsed = banDurationSchema.safeParse(first);
    if (!parsed.success && /^\d/.test(first)) {
      return `I couldn't read \`${first}\` as a ban length. Use a number and a unit (s, m, h, d or w), like \`90m\` or \`6.5d\`, or \`perm\`.`;
    }
    const reason = (parsed.success ? words : [first, ...words])
      .join(' ')
      .trim();
    await decide({
      action,
      actorId,
      userId,
      duration: parsed.data,
      reason: reason || undefined,
    });
    return `Banned <@${userId}> (${parsed.data ? first : 'permanent'}).`;
  };
}

export const ban = moderate('ban');
export const unban = moderate('unban');
