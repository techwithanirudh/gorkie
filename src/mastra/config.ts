export const sandbox = {
  template: 'gorkie-workspace:1.2',
  timeout: 8 * 60 * 1000,
  workdir: '/home/user',
};

export const agent = {
  maxTokens: { input: 900_000, output: 32_768 },
};
