import type { AgentSchedule, AnySchedule } from '@mastra/core/schedules';

export function isAgentSchedule(
  schedule: AnySchedule
): schedule is AgentSchedule {
  return schedule.agentId !== undefined;
}
