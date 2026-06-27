import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { fetchSlackFile } from '@chat-adapter/slack/api';
import type { E2BSandbox } from '@mastra/e2b';
import { slack } from '../channels/slack';
import { env } from '../../env';

const SLACK_FILE_ID = /(F[A-Z0-9]{6,})/;

export const getFileTool = createTool({
  id: 'get_file',
  description:
    'Download a Slack file (upload, snippet, image, canvas, any type) into the sandbox so you can read or process it. Accepts a Slack file URL, permalink, or file id.',
  inputSchema: z.object({
    file: z
      .string()
      .min(1)
      .describe('A Slack file URL, permalink, or file id (e.g. F0123ABCD).'),
    filename: z.string().optional().describe('Optional name to save it as.'),
  }),
  execute: async ({ file, filename }, context) => {
    if (!context?.workspace || !context.requestContext) {
      throw new Error('No workspace context.');
    }
    const sandbox = (await context.workspace.resolveSandbox({
      requestContext: context.requestContext,
    })) as E2BSandbox | undefined;
    if (!sandbox) throw new Error('No sandbox available.');
    await sandbox.start();

    const fileId = SLACK_FILE_ID.exec(file)?.[1];
    const info = fileId
      ? (await slack.webClient.files.info({ file: fileId })).file
      : undefined;
    const url =
      info?.url_private_download ??
      info?.url_private ??
      (file.startsWith('http') ? file : undefined);
    if (!url) throw new Error(`Could not resolve a download URL for: ${file}`);

    const res = await fetchSlackFile({ token: env.SLACK_BOT_TOKEN, url });
    if (!res.ok) throw new Error(`Failed to download Slack file: ${res.status}`);
    const data = await res.arrayBuffer();

    const name = (filename ?? info?.name ?? fileId ?? 'slack-file').replace(
      /[^\w.\-]+/g,
      '_',
    );
    const path = `downloads/${name}`;
    await sandbox.e2b.files.write(path, data);

    return {
      path,
      filename: name,
      mimeType: info?.mimetype,
      summary: `Downloaded ${name} to ${path} in the sandbox.`,
    };
  },
});
