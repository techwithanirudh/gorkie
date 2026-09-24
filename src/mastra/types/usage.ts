export interface UsageWindow {
  limit: number;
  remaining: number;
  resetsAt?: Date;
}

export interface TurnUsage {
  day: UsageWindow;
  hour: UsageWindow;
}

// 'unchecked' means the usage lookup failed and the turn went ahead unrecorded.
export type TurnClaim =
  | { status: 'claimed' | 'unchecked' }
  | { status: 'over-limit'; notice: string };
