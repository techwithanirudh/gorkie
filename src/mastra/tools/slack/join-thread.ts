import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chat } from '../../chat/instance';
import { channelContext } from '../../lib/context';
import { input, output } from '../../types/tools/index';

export const joinThreadTool = createTool({
  id: 'join_thread',
  description:
    'Rejoin the current thread: start auto-responding to its messages again after leaving it. Use this when someone asks you to come back, follow along, or start listening again. Without it a thread you left only wakes on a direct @mention of its very first message.',
  inputSchema: input({}),
  outputSchema: output({ threadId: z.string() }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Rejoined thread ${output?.threadId ?? ''}`,
      }),
    },
  },
  execute: async (_input, context) => {
    const { threadId } = channelContext(context?.requestContext);
    if (!threadId) {
      throw new Error('No current thread.');
    }
    const thread = chat().thread(threadId);
    await thread.subscribe();
    await thread.setState({ respondOnThreadMessages: true });
    return { threadId };
  },
});
