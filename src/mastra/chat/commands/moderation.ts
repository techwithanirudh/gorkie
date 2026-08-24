import type { Message, Thread } from 'chat';
import { banUser, unbanUser } from '../../db/queries/bans';
import { isAdmin, parseSlackUserId } from '../../lib/bans';
import type { CommandHandler } from '../../types';
import { rawText, withoutLeadingMentions } from '../message';

function target(message: Message): { reason: string; userId?: string } {
  const body = withoutLeadingMentions(rawText(message)).trim();
  const match = body.match(
    /^(?:\/gorkie\s+(?:ban|unban)|!\w+)\s+(<@[^>]+>|@?[UW][A-Z0-9]+)(?:\s+([\s\S]*))?$/i
  );
  return {
    reason: match?.[2]?.trim() ?? '',
    userId: parseSlackUserId(match?.[1]),
  };
}

async function requireAdmin({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<boolean> {
  if (isAdmin(message.author.userId)) {
    return true;
  }
  await thread.postEphemeral(
    message.author,
    'You are not allowed to use moderation commands.',
    { fallbackToDM: false }
  );
  return false;
}

export const ban: CommandHandler = async ({ message, thread }) => {
  if (!(await requireAdmin({ message, thread }))) {
    return;
  }
  const { reason, userId } = target(message);
  if (!userId) {
    await thread.postEphemeral(
      message.author,
      'Usage: `/gorkie ban @user [reason]`',
      { fallbackToDM: false }
    );
    return;
  }
  await banUser({ bannedBy: message.author.userId, reason, userId });
  await thread.postEphemeral(message.author, `Banned <@${userId}>.`, {
    fallbackToDM: false,
  });
};

export const unban: CommandHandler = async ({ message, thread }) => {
  if (!(await requireAdmin({ message, thread }))) {
    return;
  }
  const { userId } = target(message);
  if (!userId) {
    await thread.postEphemeral(message.author, 'Usage: `/gorkie unban @user`', {
      fallbackToDM: false,
    });
    return;
  }
  const removed = await unbanUser(userId);
  await thread.postEphemeral(
    message.author,
    removed ? `Unbanned <@${userId}>.` : `<@${userId}> was not banned.`,
    { fallbackToDM: false }
  );
};
