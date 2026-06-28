import { mastra } from './mastra/index';
import { gorkieAgent } from './mastra/agents/gorkie';

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[gorkie] shutting down (${signal})`);
  gorkieAgent.getChannels()?.close();
  await mastra.shutdown().catch(() => undefined);
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    shutdown(signal).catch((err: unknown) => {
      console.error('[gorkie] shutdown failed', err);
      process.exit(1);
    });
  });
}
