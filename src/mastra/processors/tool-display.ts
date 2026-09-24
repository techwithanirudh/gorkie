import type { ProcessOutputStreamArgs } from '@mastra/core/processors';
import { resolveToolDisplay } from '../chat/tool-display';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { mastraToolDisplay } from '../types';

// Mastra's CHAT_CHANNEL_RENDER_CONTEXT_KEY is not exported; the build's
// verify-mastra-patch step fails if the literal ever moves.
const renderKey = '__mastra_chat_channel_render';

// Channels resolves the adapter's toolDisplay into this render object, and its
// render processor copies it into the driver on the first chunk it sees, data
// parts included (Observational Memory writes data-om-status before the model
// streams, some parts without awaiting). So this runs on data parts too and
// every chunk awaits the one lookup. Configured processors run first, so the
// rewrite lands before the driver opens; scheduled runs carry no render object
// and keep the adapter default.
export const toolDisplay = {
  id: 'tool-display',
  name: 'Tool Display',
  description:
    'Chooses how tool calls render in Slack for the person being answered.',
  processDataParts: true,
  async processOutputStream(args: ProcessOutputStreamArgs) {
    args.state.toolDisplay ??= (async () => {
      const render = args.requestContext?.get(renderKey);
      if (
        typeof render !== 'object' ||
        render === null ||
        !('toolDisplay' in render)
      ) {
        return;
      }
      const { threadId, userId } = channelContext(args.requestContext);
      try {
        const { mode } = await resolveToolDisplay({ threadId, userId });
        render.toolDisplay = mastraToolDisplay[mode];
      } catch (error) {
        logger.warn('[tool-display] could not resolve mode', {
          error,
          threadId,
        });
      }
    })();
    await args.state.toolDisplay;
    return args.part;
  },
};
