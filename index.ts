import { mastra } from './src/mastra/index';
import { gorkieAgent } from './src/mastra/agents/gorkie';

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[gorkie] shutting down (${signal})`);

  gorkieAgent.getChannels()?.close();
  process.exit(0);
}

try {
  await gorkieAgent.getChannels()?.initialize(mastra);
  console.log('[gorkie] online');
} catch (err) {
  console.error('[gorkie] failed to start', err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    shutdown(signal).catch((err: unknown) => {
      console.error('[gorkie] shutdown failed', err);
      process.exit(1);
    });
  });
}
