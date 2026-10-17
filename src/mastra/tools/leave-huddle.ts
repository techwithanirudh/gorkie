import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { liveHuddles } from '../huddle/live';
import { channelContext } from '../lib/context';
import { rawId } from '../lib/ids';
import { input, output } from '../types/tools/index';

export const leaveHuddleTool = createTool({
  id: 'leave_huddle',
  description:
    "Make your voice leave the current channel's Slack huddle. Use this when someone asks you to leave, hang up, or get off the call.",
  inputSchema: input({}),
  outputSchema: output({ left: z.boolean() }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.left ? 'Left the huddle' : 'Was not in a huddle here',
      }),
    },
  },
  execute: async (_input, context) => {
    const { channelId } = channelContext(context?.requestContext);
    if (!channelId) {
      throw new Error('Huddles can only be left from their channel.');
    }
    const huddle = [...liveHuddles.values()].find(
      (live) => live.channelId === rawId(channelId)
    );
    await huddle?.end('asked to leave in text');
    return { left: Boolean(huddle) };
  },
});

export const hangUpTool = createTool({
  id: 'leave',
  description:
    'Leave the huddle. Use it when someone asks you to leave, hang up, or get off the call. Say a short goodbye first.',
  inputSchema: input({}),
  outputSchema: output({ leaving: z.boolean() }),
  execute: (_input, context) => {
    const { threadId } = channelContext(context?.requestContext);
    const huddle = [...liveHuddles.values()].find(
      (live) => live.slackThreadId === threadId
    );
    huddle?.hangUp();
    return Promise.resolve({ leaving: Boolean(huddle) });
  },
});
