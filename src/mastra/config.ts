export const sandbox = {
  template: 'gorkie-workspace:1.2',
  timeout: 8 * 60 * 1000,
  workdir: '/home/user',
};

export const agent = {
  // kimi-k2.6's context window is ~256k total, so input must leave room for
  // maxOutputTokens plus system/tool-schema overhead that isn't counted here.
  maxTokens: { input: 200_000, output: 32_768 },
};

export const scheduledTasks = {
  minInterval: 30 * 60 * 1000,
};
