import { z } from 'zod';
import { parseSlackInput, slackFileId } from '../../lib/ids';
import type { ChannelContext } from '../../types';

export const canvasIdSchema = z
  .string()
  .refine(
    (value) => slackFileId(value) === value,
    'Must be a bare Slack file id (e.g. F0123ABCD), not a URL or permalink.'
  )
  .describe('Slack canvas id, e.g. F0123ABCD.');

export function assertCanManageChannel({
  channelIds,
  ctx,
}: {
  channelIds: string[];
  ctx: ChannelContext;
}): string {
  const current = ctx.channelId;
  if (!current) {
    throw new Error('No current Slack channel to compare against.');
  }
  const { channel } = parseSlackInput(current);
  if (
    !channelIds.some(
      (channelId) => parseSlackInput(channelId).channel === channel
    )
  ) {
    throw new Error(
      'Can only manage canvases for the current channel, not other channels.'
    );
  }
  return current;
}
