export interface UsageWindow {
  limit: number;
  remaining: number;
  // When the oldest counted turn ages out and frees a slot; unset when none do.
  resetsAt?: Date;
}

export interface TurnUsage {
  day: UsageWindow;
  hour: UsageWindow;
}
