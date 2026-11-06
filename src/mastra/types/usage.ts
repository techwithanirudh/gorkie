export interface UsageWindow {
  limit: number;
  remaining: number;
  resetsAt?: Date;
}

export interface TurnUsage {
  day: UsageWindow;
  hour: UsageWindow;
}
