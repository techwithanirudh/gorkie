import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { resolveUserProfile } from '../../chat/names';
import { spendSlackCall } from '../../lib/slack-budget';
import { input, output } from '../../types/tools/index';

export const getUserTool = createTool({
  id: 'get_user',
  description:
    "Look up one Slack user's profile by raw user id, such as U0123ABCD. Returns names, pronouns, timezone, title, status, and custom profile fields. Use search_slack instead when you only know the person's name.",
  inputSchema: input({
    userId: z.string().min(1).describe('Slack user id, e.g. U123ABC'),
  }),
  outputSchema: output({
    userId: z.string(),
    userName: z.string().optional(),
    fullName: z.string().optional(),
    pronouns: z.string().optional(),
    title: z.string().optional(),
    status: z.string().optional(),
    timezone: z.string().optional(),
    timezoneLabel: z.string().optional(),
    fields: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.userName ?? output?.userId ?? 'User found',
      }),
    },
  },
  execute: async ({ userId }, context) => {
    spendSlackCall(context.requestContext);

    const profile = await resolveUserProfile(userId);
    if (!profile) {
      throw new Error(`Could not find a user with id ${userId}.`);
    }
    return {
      userId,
      userName: profile.displayName,
      fullName: profile.realName,
      pronouns: profile.pronouns,
      title: profile.title,
      status: profile.status,
      timezone: profile.timezone,
      timezoneLabel: profile.timezoneLabel,
      fields: profile.fields,
    };
  },
});
