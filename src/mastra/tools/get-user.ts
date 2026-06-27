import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../channels/slack';
import { rawId } from './slack-context';

export const getUserTool = createTool({
  id: 'get_user',
  description:
    "Look up a Slack user's profile (name, username, bot status, email) by their user id.",
  inputSchema: z.object({
    userId: z.string().describe('Slack user id, e.g. U123ABC'),
  }),
  outputSchema: z.object({
    userId: z.string(),
    userName: z.string(),
    fullName: z.string(),
    isBot: z.boolean(),
    email: z.string().optional(),
  }),
  execute: async ({ userId }) => {
    const user = await slack.getUser(rawId(userId));
    if (!user) throw new Error(`User ${userId} not found.`);
    return {
      userId: user.userId,
      userName: user.userName,
      fullName: user.fullName,
      isBot: user.isBot,
      email: user.email,
    };
  },
});
