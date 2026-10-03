import type { Processor } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import { getTransformedToolPayload } from '@mastra/core/tools';
import { detailedToolDisplay } from '../chat/tool-display';
import { toolDisplay as config } from '../config';
import { getUserSettings } from '../db/queries/settings';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { mastraToolDisplay } from '../types';

// Mastra's CHAT_CHANNEL_RENDER_CONTEXT_KEY is not exported; the build's
// verify-mastra-patch step fails if the literal ever moves.
const renderKey = '__mastra_chat_channel_render';

// Channels copies this render object into the driver on the first chunk,
// data parts included, so every chunk awaits the one lookup.
// A function-form toolDisplay on the adapter resolves to 'cards'; toolDisplayFn
// on the render object keeps the 'grouped' plan. The renderer gets no chunk
// metadata, so transform.display summaries are read here off tool-result chunks.
async function applyToolDisplay({
  requestContext,
  summaries,
}: {
  requestContext?: RequestContext;
  summaries: Map<string, string>;
}): Promise<void> {
  const render = requestContext?.get(renderKey);
  if (
    typeof render !== 'object' ||
    render === null ||
    !('toolDisplay' in render) ||
    !('toolDisplayFn' in render)
  ) {
    return;
  }
  const { threadId, userId } = channelContext(requestContext);
  try {
    const mode =
      (userId ? (await getUserSettings(userId)).toolDisplay : undefined) ??
      config.default;
    render.toolDisplay = mastraToolDisplay[mode];
    if (mode === 'detailed') {
      render.toolDisplayFn = detailedToolDisplay({ summaries });
    }
  } catch (error) {
    logger.warn('[tool-display] could not resolve mode', { error, threadId });
  }
}

export const toolDisplay = {
  id: 'tool-display',
  name: 'Tool Display',
  description:
    'Chooses how tool calls render in Slack for the person being answered.',
  processDataParts: true,
  async processOutputStream(args) {
    if (!args.state.toolDisplay) {
      const summaries = new Map<string, string>();
      args.state.summaries = summaries;
      args.state.toolDisplay = applyToolDisplay({
        requestContext: args.requestContext,
        summaries,
      });
    }
    await args.state.toolDisplay;
    const { part } = args;
    const { summaries } = args.state;
    if (part.type !== 'tool-result' || !(summaries instanceof Map)) {
      return part;
    }
    const shown = getTransformedToolPayload(
      part.metadata,
      'display',
      'output-available'
    )?.transformed;
    const summary =
      typeof shown === 'object' && shown !== null && 'summary' in shown
        ? shown.summary
        : shown;
    if (typeof summary === 'string' && summary) {
      summaries.set(part.payload.toolCallId, summary);
    }
    return part;
  },
} satisfies Processor<'tool-display'>;
