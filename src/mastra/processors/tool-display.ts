import type { Processor } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import { getTransformedToolPayload } from '@mastra/core/tools';
import { detailedToolDisplay } from '../chat/tool-display';

// Mastra's CHAT_CHANNEL_RENDER_CONTEXT_KEY is not exported; the build's
// verify-mastra-patch step fails if the literal ever moves.
export const renderKey = '__mastra_chat_channel_render';

// Channels copies this render object into the driver on the first chunk,
// data parts included, so it must be set before that chunk passes on.
// A function-form toolDisplay on the adapter resolves to 'cards'; toolDisplayFn
// on the render object keeps the 'grouped' plan. The renderer gets no chunk
// metadata, so transform.display summaries are read here off tool-result chunks.
function applyToolDisplay({
  requestContext,
  summaries,
}: {
  requestContext?: RequestContext;
  summaries: Map<string, string>;
}): void {
  const render = requestContext?.get(renderKey);
  if (
    typeof render !== 'object' ||
    render === null ||
    !('toolDisplay' in render) ||
    !('toolDisplayFn' in render)
  ) {
    return;
  }
  render.toolDisplay = 'grouped';
  render.toolDisplayFn = detailedToolDisplay({ summaries });
}

export const toolDisplay = {
  id: 'tool-display',
  name: 'Tool Display',
  description:
    'Renders tool calls in Slack as one grouped plan with a card per call.',
  processDataParts: true,
  processOutputStream({ part, requestContext, state }) {
    if (!(state.summaries instanceof Map)) {
      const summaries = new Map<string, string>();
      state.summaries = summaries;
      applyToolDisplay({ requestContext, summaries });
    }
    const { summaries } = state;
    if (part.type !== 'tool-result' || !(summaries instanceof Map)) {
      return Promise.resolve(part);
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
    return Promise.resolve(part);
  },
} satisfies Processor<'tool-display'>;
