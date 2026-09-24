import { createTool } from '@mastra/core/tools';
import { Chat } from 'chat';
import { z } from 'zod';
import { setThreadState } from '../../chat/state';
import { channelContext } from '../../lib/context';

export const leaveThreadTool = createTool({
  id: 'leave_thread',
  description:
    'Leave the current thread: stop auto-responding to its messages. Use this when asked to stop following a thread, be quiet, or let people talk without you. You can still be pinged back with a direct @mention.',
  inputSchema: z.strictObject({}),
  outputSchema: z.strictObject({ threadId: z.string() }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Left thread ${output?.threadId ?? ''}`,
      }),
    },
  },
  execute: async (_input, context) => {
    const { threadId } = channelContext(context.requestContext);
    if (!threadId) {
      throw new Error('No current thread.');
    }
    const thread = Chat.getSingleton().thread(threadId);
    await setThreadState({
      thread,
      patch: { dropMessagesBefore: Date.now(), respondOnThreadMessages: false },
    });
    await thread.unsubscribe();
    return { threadId };
  },
});
