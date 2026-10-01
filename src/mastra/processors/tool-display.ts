import type { ProcessOutputStreamArgs } from '@mastra/core/processors';
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

// TODO(slopradar): comment essay : 16 lines across three paragraphs narrating channels internals → keep one or two lines per vendor fact (render object copied on the first chunk; function-form display resolves to 'cards') and move the rest to IMPLEMENTED.md
// Channels resolves the adapter's toolDisplay into this render object, and its
// render processor copies it into the driver on the first chunk it sees, data
// parts included (Observational Memory writes data-om-status before the model
// streams, some parts without awaiting). So this runs on data parts too and
// every chunk awaits the one lookup. Configured processors run first, so the
// rewrite lands before the driver opens; scheduled runs carry no render object
// and keep the adapter default.
//
// A function-form toolDisplay set on the adapter resolves to 'cards', which
// drops the plan session and its task cap. Setting toolDisplayFn on the render
// object next to toolDisplay 'grouped' keeps one plan per turn; the patch gives
// it the plan header the built-in grouped renderer sets.
//
// The renderer is not handed chunk metadata, so each tool's transform.display
// summary is read here off the tool-result chunk, which passes through this
// processor before the driver renders it.
export const toolDisplay = {
  id: 'tool-display',
  name: 'Tool Display',
  description:
    'Chooses how tool calls render in Slack for the person being answered.',
  processDataParts: true,
  async processOutputStream(args: ProcessOutputStreamArgs) {
    // TODO(slopradar): large inline closure : a 28-line async IIFE inside the processor literal → a module-level applyToolDisplay({ requestContext, state }) per CODING_STANDARDS
    args.state.toolDisplay ??= (async () => {
      const render = args.requestContext?.get(renderKey);
      if (
        typeof render !== 'object' ||
        render === null ||
        !('toolDisplay' in render) ||
        !('toolDisplayFn' in render)
      ) {
        return;
      }
      const { threadId, userId } = channelContext(args.requestContext);
      try {
        const mode =
          (userId ? (await getUserSettings(userId)).toolDisplay : undefined) ??
          config.default;
        render.toolDisplay = mastraToolDisplay[mode];
        if (mode === 'detailed') {
          const summaries = new Map<string, string>();
          args.state.summaries = summaries;
          render.toolDisplayFn = detailedToolDisplay({ summaries });
        }
      } catch (error) {
        logger.warn('[tool-display] could not resolve mode', {
          error,
          threadId,
        });
      }
    })();
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
};
