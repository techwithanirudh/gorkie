export const sandbox = {
  template: 'gorkie-workspace:2.0',
  timeout: 8 * 60 * 1000,
  workdir: '/home/user',
};

export const agent = {
  id: 'orchestrator',
  maxTokens: { input: 200_000, output: 32_768 },
  maxSteps: 1000,
};

export const scheduledTasks = {
  minInterval: 30 * 60 * 1000,
};

export const workingModel = {
  ttl: 30 * 60 * 1000,
};
