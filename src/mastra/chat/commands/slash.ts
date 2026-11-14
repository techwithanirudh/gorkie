import type { SlashCommandChannelHandler } from '@mastra/core/channels';
import { z } from 'zod';
import { logger } from '../../lib/logger';
import { commandList } from './help';
import { sharedCommands, threadCommands } from './index';

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
    logger.warn('[commands] slash command had no response_url');
    return;
  }
  // response_url reaches the invoker privately in any conversation, including
  // ones the bot is not in, which chat.postEphemeral cannot.
  await fetch(parsed.data.response_url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ response_type: 'ephemeral', text }),
  }).catch((error: unknown) =>
    logger.warn('[commands] could not answer the slash command', { error })
  );
}

export const onSlashCommand: SlashCommandChannelHandler = async (event) => {
  const { userId } = event.user;
  const [, word = '', args = ''] =
    event.text.trim().match(/^(\S*)\s*(.*)$/s) ?? [];
  const name = word.toLowerCase() || 'help';
  const shared = sharedCommands[name];
  if (shared) {
    const text = await shared({
      args,
      isDM: event.channel.isDM,
      prefix: `${event.command} `,
      userId,
    });
    await reply({ raw: event.raw, text });
    return;
  }
  const text = threadCommands[name]
    ? `\`!${name}\` acts on a thread, so type it as a message in the thread instead.`
    : `\`${event.command} ${word}\` isn't a valid command. Here's what you can use:\n\n${commandList(userId)}`;
  await reply({ raw: event.raw, text });
};
