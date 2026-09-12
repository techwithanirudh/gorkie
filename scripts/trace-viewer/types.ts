export interface Run {
  agent: string;
  endedAt: string;
  preview: string;
  startedAt: string;
  status: string;
  threadId: string;
  traceId: string;
  user: string;
}

export interface Thread {
  errors: number;
  id: string;
  last: string;
  runs: Run[];
  title: string;
  users: string[];
}

export interface Item {
  collapsed?: string;
  detail?: string;
  failed?: boolean;
  kind: 'user' | 'assistant' | 'tool' | 'error' | 'meta' | 'context';
  text: string;
  who?: string;
}

export interface Span {
  attributes?: Record<string, unknown>;
  endedAt?: string;
  input?: unknown;
  name?: string;
  output?: unknown;
  parentSpanId?: string | null;
  spanType?: string;
  startedAt?: string;
}

export interface Names {
  channels: Record<string, string>;
  users: Record<string, string>;
}
