import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { resolveUserProfile } from '../chat/names';

export const getUserTool = createTool({
  id: 'get_user',
  description:
    "Look up a Slack user's profile by id (U0123ABCD): display name, real name, pronouns, title, status, and custom profile fields (Website, GitHub, etc.). Use their pronouns when referring to them.",
  inputSchema: z.object({
    userId: z.string().min(1).describe('Slack user id, e.g. U123ABC'),
  }),
  execute: async ({ userId }) => {
    const profile = await resolveUserProfile(userId);
    if (!profile) {
      return { found: false, userId, summary: `Could not find a user with id ${userId}.` };
    }
    return {
      found: true,
      userId,
      userName: profile.displayName,
      fullName: profile.realName,
      pronouns: profile.pronouns,
      title: profile.title,
      status: profile.status,
      fields: profile.fields,
      summary: `${profile.displayName ?? userId}${profile.pronouns ? ` (${profile.pronouns})` : ''}${profile.title ? `, ${profile.title}` : ''}.`,
    };
  },
});
