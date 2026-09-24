import type { E2BSandbox } from '@mastra/e2b';

export interface BackgroundJob {
  attachPid: (pid: string) => void;
  attachSandbox: (sandbox: E2BSandbox) => void;
  end: () => void;
}
