import type {
  AgentSchedule,
  AnySchedule,
  ScheduleEffective,
} from '@mastra/core/schedules';
import type { ToolExecutionContext } from '@mastra/core/tools';
import { z } from 'zod';
import { agent as agentConfig } from '../../config';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';

export const waitMetadata = { kind: 'wait' } as const;

// Schedule hooks get the row as an untyped `ScheduleRef`, hence the parse.
export function isWaitSchedule(schedule: { metadata?: unknown }): boolean {
  return z
    .object({ kind: z.literal(waitMetadata.kind) })
    .safeParse(schedule.metadata).success;
}

export function isScheduledTask(
  schedule: AnySchedule
): schedule is AgentSchedule {
  return schedule.agentId === agentConfig.id && !isWaitSchedule(schedule);
}

export function channelWake(
  context: ToolExecutionContext
): Pick<ScheduleEffective, 'ifActive' | 'ifIdle' | 'signalType'> {
  return {
    signalType: 'notification',
    ifActive: { behavior: 'persist' },
    ifIdle: {
      behavior: 'wake',
      streamOptions: {
        requestContext: { channel: channelContext(context.requestContext) },
      },
    },
  };
}

export function ownSchedules(context: ToolExecutionContext) {
  const service = context.mastra?.schedules;
  const resourceId = context.agent?.resourceId;
  const { userId } = channelContext(context.requestContext);
  if (!resourceId) {
    throw new Error('No current Slack resource for scheduled tasks.');
  }
  if (!userId || rawId(userId) !== rawId(resourceId)) {
    throw new Error(
      'Only the person who started this conversation can manage its scheduled tasks. Ask them, or start your own thread or DM.'
    );
  }
  if (!service) {
    throw new Error('No Mastra schedule service is available.');
  }
  return { resourceId, service };
}
