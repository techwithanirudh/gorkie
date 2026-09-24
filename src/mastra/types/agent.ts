import type { AgentExecutionOptions } from '@mastra/core/agent';

type StopCondition = Exclude<
  NonNullable<AgentExecutionOptions['stopWhen']>,
  unknown[]
>;

export type MastraStopCondition = (
  options: Parameters<StopCondition>[0]
) => boolean;
