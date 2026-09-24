import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { setFocus } from '../chat/focus';
import { channelContext } from '../lib/context';
import { slackUserIdSchema } from '../types';

export const focusTool = createTool({
  id: 'focus',
  description:
    "Make yourself read and answer only certain people in the current Slack thread, so nobody else can steer it. Everyone else's messages stop reaching you and are left out of the thread history you see. The person asking is always included, and whoever brought you into the thread and gorkie moderators always get through. Pass clear: true to answer everyone again. Only whoever brought you into the thread, or a moderator, can change it; the result says so when the person asking cannot. People can also type `!focus @someone` or `!focus off` themselves.",
  inputSchema: z.strictObject({
    userIds: z
      .array(slackUserIdSchema)
      .max(20)
      .default([])
      .describe(
        'Slack user ids (U...) to focus on besides the person asking. Empty focuses on the person asking alone.'
      ),
    clear: z.boolean().default(false).describe('Turn focus off.'),
  }),
  outputSchema: z.strictObject({ ok: z.boolean(), message: z.string() }),
  execute: async ({ userIds, clear }, context) => {
    const { isDM, threadId, userId } = channelContext(context.requestContext);
    if (isDM || !threadId || !userId) {
      throw new Error('Focus only applies in a shared Slack thread.');
    }
    const result = await setFocus({
      actorId: userId,
      threadId,
      userIds: clear ? [] : [userId, ...userIds],
    });
    return { ok: result.ok, message: result.text };
  },
});
