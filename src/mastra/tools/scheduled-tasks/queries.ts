import type {
  AgentSchedule,
  AnySchedule,
  Schedules,
} from '@mastra/core/schedules';
import { agent as agentConfig } from '../../config';

export function isAgentSchedule(
  schedule: AnySchedule
): schedule is AgentSchedule {
  return schedule.agentId !== undefined;
}

export async function ownedSchedule({
  schedules,
  id,
  resourceId,
}: {
  schedules: Schedules;
  id: string;
  resourceId: string;
}): Promise<AgentSchedule | undefined> {
  const schedule = await schedules.get(id);
  if (
    !(schedule && isAgentSchedule(schedule)) ||
    schedule.agentId !== agentConfig.id ||
    schedule.resourceId !== resourceId
  ) {
    return;
  }
  return schedule;
}
