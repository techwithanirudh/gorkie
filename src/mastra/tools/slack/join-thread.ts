import { createTool } from '@mastra/core/tools';
import { Chat } from 'chat';
import { z } from 'zod';
import { setThreadState } from '../../chat/state';
import { channelContext } from '../../lib/context';

export const joinThreadTool = createTool({
  id: 'join_thread',
  description:
    'Rejoin the current thread: start auto-responding to its messages again after leaving it. Use this when someone asks you to come back, follow along, or start listening again. Without it you still answer a direct @mention anywhere in a thread you left, but standing auto-response only comes back when the mention lands on its very first message.',
  inputSchema: z.strictObject({}),
  outputSchema: z.strictObject({ threadId: z.string() }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Rejoined thread ${output?.threadId ?? ''}`,
      }),
    },
  },
  execute: async (_input, context) => {
    const { threadId } = channelContext(context.requestContext);
    if (!threadId) {
      throw new Error('No current thread.');
    }
    const thread = Chat.getSingleton().thread(threadId);
    await thread.subscribe();
    await setThreadState({ thread, patch: { respondOnThreadMessages: true } });
    return { threadId };
  },
});
