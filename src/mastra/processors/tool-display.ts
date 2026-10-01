import type { ToolDisplayEvent } from '@mastra/core/channels';
import { parseMemoryRequestContext } from '@mastra/core/memory';
import type { ProcessOutputStreamArgs } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import { getTransformedToolPayload } from '@mastra/core/tools';
import type { CardElement } from 'chat';
import { approvalCard } from '../chat/approval-card';
import { getMastra } from '../chat/mastra-instance';
import { approvalPost, detailedToolDisplay } from '../chat/tool-display';
import { agent as agentConfig, toolDisplay as config } from '../config';
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
// rewrite lands before the driver opens. Runs without an inbound Slack event
// (schedule fires, wait and background wakes) carry no render object, so it is
// rebuilt here the way channels would, and those runs get the same display.
//
// A function-form toolDisplay set on the adapter resolves to 'cards', which
// drops the plan session and its task cap. Setting toolDisplayFn on the render
// object next to toolDisplay 'grouped' keeps one plan per turn; the patch gives
// it the plan header the built-in grouped renderer sets. In 'hidden' mode the
// streaming driver skips running and result events before it reaches
// toolDisplayFn, so a function there only changes approval cards.
//
// The renderer is not handed chunk metadata, so each tool's transform.display
// summary is read here off the tool-result chunk, which passes through this
// processor before the driver renders it. Approval cards are built here too,
// since building one can need a database read and the renderer is synchronous.
async function applyToolDisplay({
  approvals,
  requestContext,
  summaries,
}: {
  approvals: Map<string, CardElement>;
  requestContext?: RequestContext;
  summaries: Map<string, string>;
}): Promise<void> {
  const { threadId, userId } = channelContext(requestContext);
  try {
    let render = requestContext?.get(renderKey);
    const memoryThreadId =
      parseMemoryRequestContext(requestContext)?.thread?.id;
    if (!render && requestContext && memoryThreadId) {
      render = await getMastra()
        .getAgentById(agentConfig.id)
        .getChannels()
        ?.buildRenderContextForThread(memoryThreadId);
      if (render) {
        requestContext.set(renderKey, render);
      }
    }
    if (
      typeof render !== 'object' ||
      render === null ||
      !('toolDisplay' in render) ||
      !('toolDisplayFn' in render)
    ) {
      return;
    }
    const mode =
      (userId ? (await getUserSettings(userId)).toolDisplay : undefined) ??
      config.default;
    render.toolDisplay = mastraToolDisplay[mode];
    render.toolDisplayFn =
      mode === 'detailed'
        ? detailedToolDisplay({ approvals, summaries })
        : (event: ToolDisplayEvent) => approvalPost({ approvals, event });
  } catch (error) {
    logger.warn('[tool-display] could not resolve mode', {
      error,
      threadId,
    });
  }
}

export const toolDisplay = {
  id: 'tool-display',
  name: 'Tool Display',
  description:
    'Chooses how tool calls render in Slack for the person being answered.',
  processDataParts: true,
  async processOutputStream(args: ProcessOutputStreamArgs) {
    if (!args.state.toolDisplay) {
      const approvals = new Map<string, CardElement>();
      const summaries = new Map<string, string>();
      args.state.approvals = approvals;
      args.state.summaries = summaries;
      args.state.toolDisplay = applyToolDisplay({
        approvals,
        requestContext: args.requestContext,
        summaries,
      });
    }
    await args.state.toolDisplay;
    const { part } = args;
    const { approvals, summaries } = args.state;
    if (part.type === 'tool-call-approval' && approvals instanceof Map) {
      const card = await approvalCard({
        args: part.payload.args,
        requestContext: args.requestContext,
        toolCallId: part.payload.toolCallId,
        toolName: part.payload.toolName,
      }).catch((error: unknown) => {
        logger.warn('[tool-display] could not build the approval card', {
          error,
          toolName: part.payload.toolName,
        });
      });
      if (card) {
        approvals.set(part.payload.toolCallId, card);
      }
      return part;
    }
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
