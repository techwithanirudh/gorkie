import { createTool } from '@mastra/core/tools';
import { Chat } from 'chat';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { slack as slackConfig } from '../../config';
import { parseSlackInput } from '../../lib/ids';
import { logger } from '../../lib/logger';
import { spendSlackCall } from './budget';

const userOutputSchema = z.strictObject({
  userId: z.string(),
  userName: z.string().optional(),
  fullName: z.string().optional(),
  pronouns: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  timezone: z.string().optional(),
  timezoneLabel: z.string().optional(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })),
});

const userProfileSchema = userOutputSchema.omit({ userId: true });

type UserProfile = z.infer<typeof userProfileSchema>;

async function resolveUserProfile(
  userId: string
): Promise<UserProfile | undefined> {
  const cacheKey = `slack:user-profile:${userId}`;
  const bot = Chat.getSingleton();
  const cached = userProfileSchema.safeParse(
    await bot.getState().get(cacheKey)
  );
  if (cached.success) {
    return cached.data;
  }

  let profile: UserProfile;
  let ttl = slackConfig.profileTtlMs;
  try {
    const [{ profile: raw }, { user: info }] = await Promise.all([
      slack.webClient.users.profile.get({
        include_labels: true,
        user: userId,
      }),
      slack.webClient.users.info({ user: userId }),
    ]);
    if (!(raw || info)) {
      return;
    }
    profile = {
      userName:
        info?.profile?.display_name ||
        info?.profile?.real_name ||
        info?.real_name ||
        info?.name ||
        raw?.display_name ||
        undefined,
      fields: Object.values(raw?.fields ?? {}).flatMap((field) =>
        field.value && field.label
          ? [{ label: field.label, value: field.value }]
          : []
      ),
      pronouns: raw?.pronouns || undefined,
      fullName:
        info?.real_name ||
        info?.profile?.real_name ||
        raw?.real_name ||
        undefined,
      status: raw?.status_text || undefined,
      timezone: info?.tz || undefined,
      timezoneLabel: info?.tz_label || undefined,
      title: raw?.title || undefined,
    };
  } catch (error) {
    logger.warn('[slack] could not fetch the user profile', { error, userId });
    // Chat SDK's user lookup is cached, so it can still name the person.
    const user = await bot.getUser(userId);
    if (!user) {
      return;
    }
    profile = {
      userName: user.userName,
      fields: [],
      fullName: user.fullName,
    };
    ttl = slackConfig.failedProfileTtlMs;
  }

  await bot
    .getState()
    .set(cacheKey, profile, ttl)
    .catch((error: unknown) => {
      logger.debug('[slack] could not cache user profile', { error, userId });
    });
  return profile;
}

export const getUserTool = createTool({
  id: 'get_user',
  description:
    "Look up one Slack user's profile by raw user id, such as U0123ABCD. Returns names, pronouns, timezone, title, status, and custom profile fields. Use search_slack instead when you only know the person's name.",
  inputSchema: z.strictObject({
    userId: z.string().min(1).describe('Slack user id, e.g. U123ABC'),
  }),
  outputSchema: userOutputSchema,
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.userName ?? output?.userId ?? 'User found',
      }),
    },
  },
  execute: async ({ userId }, context) => {
    spendSlackCall(context.requestContext);

    const profile = await resolveUserProfile(
      parseSlackInput(userId).channel ?? userId
    );
    if (!profile) {
      throw new Error(`Could not find a user with id ${userId}.`);
    }
    return { userId, ...profile };
  },
});
