import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { artifacts as config } from '../config';
import {
  sandboxPath as p,
  requireSandbox,
  writeSandboxFile,
} from '../workspace';

const kinds = ['findings', 'report', 'plan', 'review'] as const;

const artifactId = z
  .string()
  .regex(new RegExp(`^(${kinds.join('|')})-[0-9a-f]{12}$`));

export const saveArtifactTool = createTool({
  id: 'save_artifact',
  description: `Save a long write-up as a Markdown artifact in the thread sandbox and get back its id, so the parent can read it by id instead of receiving the whole text in your reply. Use it when your full answer would run well past the return limit. Then return your short answer plus the id. Kinds: findings (evidence gathered), report (a finished write-up), plan (steps to take), review (an audit of code or a document). At most ${config.maxChars} characters.`,
  inputSchema: z.strictObject({
    kind: z.enum(kinds),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(config.maxChars).describe('Markdown.'),
  }),
  outputSchema: z.strictObject({
    id: z.string(),
    path: z.string(),
    chars: z.number(),
  }),
  transform: {
    display: {
      output: ({ input }) => ({
        summary: `Saved ${input?.kind ?? 'artifact'}: ${input?.title ?? ''}`,
      }),
    },
  },
  execute: async ({ kind, title, body }, context) => {
    const sandbox = await requireSandbox(context.requestContext);
    const id = `${kind}-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const path = p('.artifacts', `${id}.md`);
    const content = `# ${title}\n\n${body}\n`;
    await writeSandboxFile({ data: content, path, sandbox });
    return { id, path, chars: content.length };
  },
});

export const readArtifactTool = createTool({
  id: 'read_artifact',
  description:
    "Read a Markdown artifact a subagent saved with save_artifact, by the id it returned. Read one only when the subagent's short answer is not enough. The file also sits at .artifacts/<id>.md in the sandbox, so it can be uploaded or grepped without reading it here.",
  inputSchema: z.strictObject({
    id: artifactId.describe('Artifact id, e.g. findings-0123456789ab.'),
  }),
  outputSchema: z.strictObject({
    id: z.string(),
    kind: z.enum(kinds),
    body: z.string(),
  }),
  transform: {
    display: {
      output: ({ input }) => ({ summary: `Read artifact ${input?.id ?? ''}` }),
    },
  },
  execute: async ({ id }, context) => {
    const sandbox = await requireSandbox(context.requestContext);
    const path = p('.artifacts', `${id}.md`);
    const exists = await sandbox.retryOnDead(() =>
      sandbox.e2b.files.exists(path)
    );
    if (!exists) {
      throw new Error(`No artifact ${id} in this thread's sandbox.`);
    }
    const body = await sandbox.retryOnDead(() =>
      sandbox.e2b.files.read(path, { format: 'text' })
    );
    return { id, kind: z.enum(kinds).parse(id.split('-')[0]), body };
  },
});
