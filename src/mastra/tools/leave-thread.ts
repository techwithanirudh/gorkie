import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chat } from '../chat/instance';
import { channelContext } from '../types';

export const leaveThreadTool = createTool({
  id: 'leave_thread',
  description:
    'Leave the current thread: stop auto-responding to its messages. Use this when asked to stop following a thread, be quiet, or let people talk without you. You can still be pinged back with a direct @mention.',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const threadId = channelContext(context?.requestContext).threadId;
    if (!threadId) throw new Error('No current thread.');
    const thread = chat().thread(threadId);
    await thread.setState({ respondOnThreadMessages: false });
    await thread.unsubscribe();
    return {
      left: true,
      summary: 'Left the thread. I will stay quiet unless someone @mentions me directly.',
    };
  },
});
