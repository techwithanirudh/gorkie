import { z } from 'zod';
import { rawId } from '../../lib/ids';
import type { ChannelContext } from '../../types';

export const canvasIdSchema = z
  .string()
  .regex(
    /^F[A-Z0-9]+$/,
    'Must be a bare Slack file id (e.g. F0123ABCD), not a URL or permalink.'
  )
  .describe('Slack canvas id, e.g. F0123ABCD.');

export function assertCanManageChannel({
  channelIds,
  ctx,
}: {
  channelIds: string[];
  ctx: ChannelContext;
}): void {
  const current = ctx.channelId;
  if (!current) {
    throw new Error('No current Slack channel to compare against.');
  }
  if (!channelIds.some((channelId) => rawId(channelId) === rawId(current))) {
    throw new Error(
      'Can only manage canvases for the current channel, not other channels.'
    );
  }
}
