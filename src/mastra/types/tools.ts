export interface MastraStep {
  toolResults?: Array<{
    output?: unknown;
    toolName?: string;
  }>;
}

export type MastraStopCondition = (options: { steps: MastraStep[] }) => boolean;
