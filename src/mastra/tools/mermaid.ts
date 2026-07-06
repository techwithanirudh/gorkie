import { deflateSync } from 'node:zlib';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chat } from '../chat/instance';
import { channelContext } from '../lib/context';

function mermaidImageUrl(code: string): string {
  const payload = JSON.stringify({ code, mermaid: {} });
  const base64 = deflateSync(new TextEncoder().encode(payload))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/[=]+$/, '');

  return `https://mermaid.ink/img/pako:${base64}?type=png`;
}

export const mermaidTool = createTool({
  id: 'mermaid',
  description:
    'Render a Mermaid diagram and upload it as a PNG to the current Slack thread. Use for visualizing workflows, architectures, sequences, or relationships.',
  inputSchema: z.object({
    code: z
      .string()
      .min(1)
      .max(10_000)
      .describe(
        'Valid Mermaid diagram code (flowchart, sequenceDiagram, classDiagram, etc.).'
      ),
    title: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('Optional title shown with the uploaded diagram.'),
  }),
  execute: async ({ code, title }, context) => {
    const { threadId } = channelContext(context?.requestContext);
    if (!threadId) {
      throw new Error('No current thread to upload to.');
    }

    try {
      const response = await fetch(mermaidImageUrl(code));
      if (!response.ok) {
        throw new Error(
          `Mermaid rendering failed (HTTP ${response.status}). Check the diagram syntax.`
        );
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      const name = title ?? 'Mermaid Diagram';

      await chat()
        .thread(threadId)
        .post({
          markdown: title ?? '',
          files: [{ data: bytes, filename: 'diagram.png' }],
        });

      return {
        success: true,
        title: name,
        message: `Uploaded ${name} to this Slack thread.`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
