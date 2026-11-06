import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { huddleAccount } from '../huddle/account';
import { channelContext } from '../lib/context';
import { input, output } from '../types/tools/index';

export const joinHuddleTool = createTool({
  id: 'join_huddle',
  description:
    "Join the current channel's Slack huddle and talk out loud, starting a huddle if none is running. Use this when someone asks you to huddle, hop on a call, or join the huddle. The person asking counts as the one who invited you.",
  inputSchema: input({}),
  outputSchema: output({ callId: z.string(), alreadyThere: z.boolean() }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.alreadyThere
          ? 'Already in the huddle'
          : 'Joined the huddle',
      }),
    },
  },
  execute: async (_input, context) => {
    const { channelId, isDM, userId } = channelContext(context?.requestContext);
    if (!huddleAccount.join) {
      throw new Error('Huddles are not set up on this gorkie.');
    }
    if (isDM || !(channelId && userId)) {
      throw new Error('Huddles can only be joined from a channel.');
    }
    return await huddleAccount.join({ channelId, inviterId: userId });
  },
});
