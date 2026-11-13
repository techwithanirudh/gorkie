import type { Mastra } from '@mastra/core/mastra';
import type { SchedulePrepareContext } from '@mastra/core/schedules';
import { z } from 'zod';
import { banStatus } from './chat/moderation/gate';
import { isUserAllowed } from './lib/allowed-users';
import { rawId } from './lib/ids';
import { overLimit } from './lib/limits';
import { logger } from './lib/logger';
import { slackUserIdSchema } from './types';

const requestContextSchema = z.object({
  channel: z.object({ userId: slackUserIdSchema }),
});

// Only `null` skips a fire; `undefined` fires it with the row's defaults.
export async function prepareScheduledFire({
  mastra,
  schedule,
}: SchedulePrepareContext<Mastra>): Promise<null | undefined> {
  const current = await mastra.schedules.get(schedule.id);
  if (current?.metadata?.kind === 'wait') {
    await mastra.schedules.delete(schedule.id);
  }
  if (!current) {
    return null;
  }
  const creator =
    slackUserIdSchema.safeParse(
      current.resourceId ? rawId(current.resourceId) : undefined
    ).data ??
    requestContextSchema.safeParse(
      'ifIdle' in current
        ? current.ifIdle?.streamOptions?.requestContext
        : undefined
    ).data?.channel.userId;
  if (!creator) {
    logger.warn('[schedules] skipped a schedule with no Slack creator', {
      scheduleId: schedule.id,
    });
    return null;
  }
  if ((await banStatus(creator)).status !== 'clear') {
    logger.info("[schedules] skipped a banned user's fire", {
      scheduleId: schedule.id,
      userId: creator,
    });
    return null;
  }
  if (
    !(await isUserAllowed(creator)) ||
    (await overLimit({ kind: 'tokens', userId: creator }))
  ) {
    logger.info('[schedules] skipped a fire for opt-in or usage', {
      scheduleId: schedule.id,
      userId: creator,
    });
    return null;
  }
}
