import type { Mastra } from '@mastra/core/mastra';
import type { SchedulePrepareContext } from '@mastra/core/schedules';
import { z } from 'zod';
import { optInStatus } from './chat/allowed-users';
import { banStatus } from './chat/moderation';
import { claimTurn } from './chat/usage';
import { parseSlackInput } from './lib/ids';
import { logger } from './lib/logger';
import { isWaitSchedule } from './tools/scheduled-tasks/schedules';
import { channelSchema } from './types';

const creatorSchema = z.object({ channel: channelSchema });

export async function deleteFiredWait({
  mastra,
  schedule,
}: {
  mastra: Mastra;
  schedule: { id: string; metadata?: unknown };
}): Promise<void> {
  if (isWaitSchedule(schedule)) {
    await mastra.schedules.delete(schedule.id);
  }
}

// Only `null` skips a fire; `undefined` fires it with the row's defaults.
export async function gateScheduledFire({
  mastra,
  schedule,
}: SchedulePrepareContext<Mastra>): Promise<null | undefined> {
  const current = await mastra.schedules.get(schedule.id);
  if (!current) {
    return null;
  }
  const creator =
    creatorSchema.safeParse(
      'ifIdle' in current
        ? current.ifIdle?.streamOptions?.requestContext
        : undefined
    ).data?.channel.userId ?? parseSlackInput(current.resourceId).channel;
  if (!creator) {
    logger.warn('[schedules] skipped a fire with no resolvable creator', {
      scheduleId: schedule.id,
    });
    return null;
  }
  if ((await banStatus(creator)).status === 'banned') {
    logger.info("[schedules] skipped a banned user's fire", {
      scheduleId: schedule.id,
    });
    return null;
  }
  const optIn = await optInStatus(creator);
  if (optIn === 'not-allowed') {
    logger.info("[schedules] skipped an opted-out user's fire", {
      scheduleId: schedule.id,
      userId: creator,
    });
    return null;
  }
  if (optIn !== 'allowed') {
    logger.warn('[schedules] fired without a confirmed opt-in', {
      optIn,
      scheduleId: schedule.id,
      userId: creator,
    });
  }
  if ((await claimTurn(creator)).status === 'over-limit') {
    logger.info('[schedules] skipped a fire over the turn limit', {
      scheduleId: schedule.id,
      userId: creator,
    });
    return null;
  }
}
