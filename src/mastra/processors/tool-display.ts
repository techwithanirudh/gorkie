import type { ProcessOutputStreamArgs } from '@mastra/core/processors';
import { resolveToolDisplay } from '../chat/tool-display';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { mastraToolDisplay } from '../types';

// Mastra's CHAT_CHANNEL_RENDER_CONTEXT_KEY is not exported; the build's
// verify-mastra-patch step fails if the literal ever moves.
const renderKey = '__mastra_chat_channel_render';

// Channels resolves the adapter's toolDisplay into this render object when a
// message or approval click arrives, and its own processor reads it on the
// first chunk. Configured processors run first, so rewriting the field here
// picks the mode per run, approval resumes included; scheduled runs carry no
// render object and keep the adapter default.
export const toolDisplay = {
  id: 'tool-display',
  name: 'Tool Display',
  description:
    'Chooses how tool calls render in Slack for the person being answered.',
  async processOutputStream(args: ProcessOutputStreamArgs) {
    if (args.state.toolDisplayResolved) {
      return args.part;
    }
    args.state.toolDisplayResolved = true;
    const render = args.requestContext?.get(renderKey);
    if (
      typeof render !== 'object' ||
      render === null ||
      !('toolDisplay' in render)
    ) {
      return args.part;
    }
    const { threadId, userId } = channelContext(args.requestContext);
    try {
      const { mode } = await resolveToolDisplay({ threadId, userId });
      render.toolDisplay = mastraToolDisplay[mode];
    } catch (error) {
      logger.warn('[tool-display] could not resolve mode', { error, threadId });
    }
    return args.part;
  },
};
