import { limitWindowHours } from '../../config';
import { usage, usageLine } from '../../lib/limits';
import type { CommandHandler } from '../../types';
import { notify } from '../notify';

export const limits: CommandHandler = async ({ message, thread }) => {
  const lines = (await usage(message.author.userId)).map(usageLine);
  await notify({
    text: [
      '*usage limits*',
      ...lines,
      `each limit starts at its first use and resets ${limitWindowHours} hours later.`,
    ].join('\n'),
    thread,
    user: message.author,
  });
};
