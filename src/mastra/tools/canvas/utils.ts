import { z } from 'zod';
import type { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';

export const canvasIdSchema = z
  .string()
  .regex(
    /^F[A-Z0-9]+$/,
    'Must be a bare Slack file id (e.g. F0123ABCD), not a URL or permalink.'
  )
  .describe('Slack canvas id, e.g. F0123ABCD.');

export function assertCanManageChannel({
  channelId,
  ctx,
}: {
  channelId: string;
  ctx: ReturnType<typeof channelContext>;
}): void {
  if (!ctx.channelId) {
    throw new Error('No current Slack channel to compare against.');
  }
  if (rawId(channelId) !== rawId(ctx.channelId)) {
    throw new Error(
      'Can only manage canvases for the current channel, not other channels.'
    );
  }
}
