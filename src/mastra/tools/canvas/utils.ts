import { z } from 'zod';
import { env } from '@/env';
import { slack } from '../../chat/client';
import type { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { assertReadableResource } from '../slack/utils';

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

export async function readCanvasHtml({
  canvasId,
  currentThreadId,
}: {
  canvasId: string;
  currentThreadId?: string;
}): Promise<{ html: string; title?: string }> {
  const info = await slack.webClient.files.info({ file: canvasId });
  await assertReadableResource({
    channelIds: [...(info.file?.channels ?? []), ...(info.file?.groups ?? [])],
    currentThreadId,
  });
  const url = info.file?.url_private_download ?? info.file?.url_private;
  if (!url) {
    throw new Error(
      `Could not resolve a content URL for canvas ${canvasId}. It may have been deleted, or the bot may not have access to it.`
    );
  }
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to read canvas ${canvasId}: ${response.status}`);
  }
  return {
    html: await response.text(),
    ...(info.file?.title ? { title: info.file.title } : {}),
  };
}

export function canvasEditError(canvasId: string, error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);
  if (reason.includes('restricted_action')) {
    return new Error(
      `Can't edit canvas ${canvasId}: only read access, not write. This canvas's sharing settings need to grant the bot write access (its owner can do this from the canvas's "Manage access" menu in Slack), the canvases:write scope alone isn't enough.`,
      { cause: error }
    );
  }
  return error instanceof Error ? error : new Error(reason);
}
