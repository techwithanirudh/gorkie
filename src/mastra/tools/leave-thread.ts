import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getBot } from '../channels/bot';
import { channelContext } from '../types';

export const leaveThreadTool = createTool({
  id: 'leave_thread',
  description:
    'Stop auto-responding to the current thread (when asked to be quiet or let people talk). You can still be pinged back with a direct @mention.',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const threadId = channelContext(context?.requestContext).threadId;
    if (!threadId) throw new Error('No current thread.');
    const thread = getBot().thread(threadId);
    await thread.setState({ respondOnThreadMessages: false });
    await thread.unsubscribe();
    return { left: true };
  },
});
