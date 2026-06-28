import { resolve } from 'node:path';
import {
  LocalSkillSource,
  WORKSPACE_TOOLS,
  Workspace,
} from '@mastra/core/workspace';
import { E2BSandbox } from '@mastra/e2b';
import { env } from '@/env';
import { channelContext } from '../lib/context';
import { template } from './config';

export const workspace = new Workspace({
  id: 'gorkie-workspace',
  name: 'gorkie',
  sandbox: () =>
    new E2BSandbox({
      apiKey: env.E2B_API_KEY,
      template,
      instructions: [
        'You have a persistent E2B Linux sandbox (Debian, Node.js 24, Python 3) for this conversation, driven by `execute_command`.',
        'Pre-installed: agent-browser (browser automation: run `agent-browser skills get core` for usage), agentmail (Python), wrangler (Cloudflare Workers), ripgrep, fd, ffmpeg, imagemagick, jq, pillow/matplotlib/numpy/pandas.',
        'You have no Cloudflare account or auth, so never run `wrangler login`/`wrangler whoami`. To deploy, use the account-less temporary deploy (`wrangler deploy --temporary`), which returns a live `*.workers.dev` URL plus a claim link, and share both.',
        'Read, write, and edit files with shell commands (`cat`, `tee`, `sed`); install anything else before first use (`apt-get`, `pip3`, `npm`).',
        'Verify your work by running it before claiming it works; read stderr and fix failures instead of re-running the same failing command.',
        'The sandbox persists across turns in this thread, so files and installed tools you create stay available. Files are not visible in chat unless you post them back.',
      ].join(' '),
    }),
  sandboxCacheKey: ({ requestContext }) =>
    channelContext(requestContext).threadId,
  skillSource: new LocalSkillSource({
    basePath: resolve(import.meta.dirname, '../../workspace'),
  }),
  skills: ['skills'],
  tools: {
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { name: 'execute_command' },
    [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
      name: 'get_process_output',
    },
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: { name: 'kill_process' },
  },
});
