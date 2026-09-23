import type { AgentSchedule, AnySchedule } from '@mastra/core/schedules';
import type { MastraUnion } from '@mastra/core/tools';
import { agent as agentConfig } from '../../config';

export function isAgentSchedule(
  schedule: AnySchedule
): schedule is AgentSchedule {
  return schedule.agentId !== undefined;
}

export async function ownedScheduleService({
  context,
  id,
}: {
  context: { agent?: { resourceId?: string }; mastra?: MastraUnion };
  id: string;
}) {
  const service = context.mastra?.schedules;
  const resourceId = context.agent?.resourceId;
  if (!(service && resourceId)) {
    throw new Error('A resourceId is required to manage a schedule.');
  }
  const schedule = await service.get(id);
  if (
    schedule?.agentId !== agentConfig.id ||
    schedule.resourceId !== resourceId
  ) {
    throw new Error(`Schedule ${id} was not found in this conversation.`);
  }
  return service;
}
