import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { huddleAccount } from '../huddle/account';
import { channelContext } from '../lib/context';
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
    if (!huddleAccount.leave) {
      throw new Error('Huddles are not set up on this gorkie.');
    }
    if (!channelId) {
      throw new Error('Huddles can only be left from their channel.');
    }
    return { left: await huddleAccount.leave({ channelId }) };
  },
});

export function hangUpTool(leave: () => void) {
  return createTool({
    id: 'leave',
    description:
      'Leave the huddle. Use it when someone asks you to leave, hang up, or get off the call. Say a short goodbye first.',
    inputSchema: input({}),
    outputSchema: output({ leaving: z.boolean() }),
    execute: () => {
      leave();
      return Promise.resolve({ leaving: true });
    },
  });
}
