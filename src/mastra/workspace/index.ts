import { Workspace } from '@mastra/core/workspace';
import { E2BSandbox } from '@mastra/e2b';
import { MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import { env } from '../../env';

// gorkie is public, so code never runs on our host: an isolated E2B sandbox, no
// host LocalFilesystem. Memoized per thread id (the key channels actually sets)
// so each Slack thread keeps one warm, isolated sandbox across turns.
export const workspace = new Workspace({
  id: 'gorkie-workspace',
  name: 'gorkie',
  sandbox: () =>
    new E2BSandbox({
      apiKey: env.E2B_API_KEY,
      // Replaces E2B's bare "Cloud sandbox." default. Static, so it stays in the
      // cached system-prompt prefix.
      instructions: `You have a persistent E2B Linux sandbox (Debian, Node.js, Python 3) for this conversation, driven by \`execute_command\`. Read, write, and edit files with normal shell commands (\`cat\`, \`tee\`, \`sed\`). Install tools before first use (\`apt-get\`, \`pip3\`, \`npm\`). Verify your work by actually running it before claiming it works; read stderr and fix failures instead of re-running the same failing command. The sandbox stays warm between messages, so \`background: true\` processes keep running. Files there aren't visible in chat unless you post them back.`,
    }),
  sandboxCacheKey: ({ requestContext }) =>
    requestContext.get(MASTRA_THREAD_ID_KEY) as string | undefined,
});
