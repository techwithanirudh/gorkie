import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';
import { setFocus } from '../focus';
import { rawText, userMention, withoutLeadingMentions } from '../message';
import { notify } from '../notify';
import { threadState } from '../state';

export const focus: CommandHandler = async ({ message, thread }) => {
  const reply = (text: string) =>
    notify({ text, thread, user: message.author });
  if (thread.isDM) {
    await reply("focus is for shared threads. in a DM it's only you anyway.");
    return;
  }

  const argument = withoutLeadingMentions(rawText(message))
    .trim()
    .replace(/^!focus\b/i, '')
    .trim();
  if (!argument) {
    const current = (await threadState(thread))?.focus ?? [];
    await reply(
      current.length > 0
        ? `focused on ${current.map((id) => `<@${id}>`).join(', ')}, plus whoever brought me into this thread and gorkie moderators. \`!focus off\` undoes it.`
        : 'focus is off here, so i answer everyone. `!focus @someone` (or `!focus me`) makes me read and answer only them.'
    );
    return;
  }

  const mentioned = Array.from(
    argument.matchAll(new RegExp(userMention, 'g')),
    ([, id]) => id
  ).filter((id) => id !== undefined);
  const off = /^(off|clear|reset)$/i.test(argument);
  if (!(off || mentioned.length > 0 || /^me$/i.test(argument))) {
    await reply('use `!focus @someone`, `!focus me`, or `!focus off`.');
    return;
  }

  const result = await setFocus({
    actorId: message.author.userId,
    threadId: thread.id,
    userIds: off ? [] : [message.author.userId, ...mentioned],
  }).catch((error: unknown) => {
    logger.error('[commands] focus failed', { error, threadId: thread.id });
    return {
      ok: false,
      text: "i couldn't change focus just now. try again in a minute.",
    };
  });
  if (!result.ok) {
    await reply(result.text);
    return;
  }
  await thread.post({ markdown: result.text }).catch((error: unknown) => {
    logger.warn('[commands] failed to post focus change', {
      error,
      threadId: thread.id,
    });
  });
};
