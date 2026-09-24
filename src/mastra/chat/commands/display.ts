import {
  type CommandHandler,
  type ToolDisplaySource,
  toolDisplayModeSchema,
} from '../../types';
import { rawText, withoutLeadingMentions } from '../message';
import { notify } from '../notify';
import { setThreadState } from '../state';
import { resolveToolDisplay } from '../tool-display';

const sources = {
  default: 'the default',
  thread: 'this thread',
  you: 'your home tab setting',
} satisfies Record<ToolDisplaySource, string>;

export const display: CommandHandler = async ({ message, thread }) => {
  const argument = withoutLeadingMentions(rawText(message))
    .trim()
    .split(/\s+/)[1]
    ?.toLowerCase();
  const reply = (text: string) =>
    notify({ text, thread, user: message.author });

  if (!argument) {
    const { mode, source } = await resolveToolDisplay({
      threadId: thread.id,
      userId: message.author.userId,
    });
    await reply(
      `tool display here is *${mode}*, from ${sources[source]}. use \`!display hidden|compact|detailed\` for this thread, or \`!display reset\`.`
    );
    return;
  }
  if (argument === 'reset') {
    await setThreadState({ thread, patch: { toolDisplay: undefined } });
    await reply(
      "tool display for this thread is back to each person's own setting."
    );
    return;
  }
  const parsed = toolDisplayModeSchema.safeParse(argument);
  if (!parsed.success) {
    await reply('pick one of `hidden`, `compact`, `detailed`, or `reset`.');
    return;
  }
  await setThreadState({ thread, patch: { toolDisplay: parsed.data } });
  await reply(`tool display for this thread is now *${parsed.data}*.`);
};
