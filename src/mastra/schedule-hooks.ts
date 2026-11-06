import type { Mastra } from '@mastra/core/mastra';
import type { SchedulePrepareContext } from '@mastra/core/schedules';
import { z } from 'zod';
import { banStatus } from './chat/moderation/gate';
import { rawId } from './lib/ids';
import { logger } from './lib/logger';

const slackUserId = z.string().regex(/^[UW][A-Z0-9]+$/);
const requestContextSchema = z.object({
  channel: z.object({ userId: slackUserId }),
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
    slackUserId.safeParse(
      current.resourceId ? rawId(current.resourceId) : undefined
    ).data ??
    requestContextSchema.safeParse(
      'ifIdle' in current
        ? current.ifIdle?.streamOptions?.requestContext
        : undefined
    ).data?.channel.userId;
  if (!creator) {
    logger.warn('[schedules] fired a schedule with no Slack creator', {
      scheduleId: schedule.id,
    });
    return;
  }
  // Fails closed: a ban that cannot be checked skips the fire, and a recurring
  // schedule fires again on its next tick.
  if ((await banStatus(creator)).status !== 'clear') {
    logger.info("[schedules] skipped a banned user's fire", {
      scheduleId: schedule.id,
      userId: creator,
    });
    return null;
  }
}
