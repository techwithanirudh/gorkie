import { limitWindowHours } from '../../config';
import { usage, usageLine } from '../../lib/limits';
import type { SharedCommand } from '../../types';

export const limits: SharedCommand = async ({ userId }) =>
  [
    '*usage limits*',
    ...(await usage(userId)).map(usageLine),
    `each limit starts at its first use and resets ${limitWindowHours} hours later.`,
  ].join('\n');
