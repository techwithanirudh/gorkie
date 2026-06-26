import { Workspace } from '@mastra/core/workspace';
import { E2BSandbox } from '@mastra/e2b';
import { MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import { env } from '../../env';

// Security: gorkie is a public bot, so the agent must NEVER execute code on our
// host. We give it an isolated E2B cloud sandbox instead of a LocalSandbox, and
// we deliberately do NOT attach a host LocalFilesystem — all commands and file
// I/O happen inside the per-thread E2B VM.
//
// The sandbox resolver runs at tool-execution time (not startup), and is memoized
// per `sandboxCacheKey`, so each Slack thread reuses one sandbox across turns
// (background processes survive between messages) while staying isolated from
// other threads.
export const workspace = new Workspace({
  id: 'gorkie-workspace',
  name: 'gorkie',
  sandbox: () =>
    new E2BSandbox({
      apiKey: env.E2B_API_KEY,
      // Keep a thread's sandbox warm for a while between messages.
      // timeout: 5 * 60 * 1000,
    }),
  // Channels stores the Mastra thread id under MASTRA_THREAD_ID_KEY, so we key
  // the per-thread sandbox cache off that (NOT a custom 'thread-id' key).
  sandboxCacheKey: ({ requestContext }) =>
    requestContext.get(MASTRA_THREAD_ID_KEY) as string | undefined,
});
