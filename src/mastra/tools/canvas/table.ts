import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { spendSlackCall } from '../../lib/slack-budget';
import { input, output } from '../../types/tools/index';
import {
  blocksToMarkdown,
  type CanvasBlock,
  type CanvasTableBlock,
  canvasHtmlToBlocks,
  tableBlocks,
} from './html';
import { canvasEditError, canvasIdSchema, readCanvasHtml } from './utils';

const tableMatchSchema = z.discriminatedUnion('by', [
  z.object({
    by: z.literal('index'),
    index: z.number().int().min(0).describe('Zero-based table position.'),
  }),
  z.object({
    by: z.literal('section'),
    header: z
      .string()
      .min(1)
      .describe('Text of the heading the table sits under.'),
  }),
  z.object({
    by: z.literal('firstCell'),
    text: z.string().min(1).describe('Text of the first data cell.'),
  }),
]);

type TableMatch = z.infer<typeof tableMatchSchema>;

function headingAbove(blocks: CanvasBlock[], index: number): string {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const block = blocks[cursor];
    if (block?.type === 'heading') {
      return block.text;
    }
  }
  return '';
}

function findTableIndex(blocks: CanvasBlock[], match: TableMatch): number {
  const tables = tableBlocks(blocks);
  if (tables.length === 0) {
    throw new Error('This canvas has no tables to update.');
  }

  if (match.by === 'index') {
    const target = tables[match.index];
    if (!target) {
      throw new Error(
        `This canvas has ${tables.length} table(s), so index ${match.index} doesn't exist.`
      );
    }
    return target.index;
  }

  if (match.by === 'section') {
    const wanted = match.header.trim().toLowerCase();
    const target = tables.find(
      (table) =>
        headingAbove(blocks, table.index).trim().toLowerCase() === wanted
    );
    if (!target) {
      const headings = tables
        .map((table) => headingAbove(blocks, table.index))
        .filter((heading) => heading.length > 0);
      throw new Error(
        `No table sits under a heading called "${match.header}". Tables sit under: ${headings.length > 0 ? headings.join(', ') : 'no headings at all'}.`
      );
    }
    return target.index;
  }

  const wanted = match.text.trim().toLowerCase();
  const target = tables.find((table) => {
    const first = table.block.rows[0]?.[0];
    return first?.trim().toLowerCase() === wanted;
  });
  if (!target) {
    const firstCells = tables
      .map((table) => table.block.rows[0]?.[0])
      .filter((cell) => cell !== undefined);
    throw new Error(
      `No table starts with the first cell "${match.text}". Tables start with: ${firstCells.length > 0 ? firstCells.join(', ') : 'no data rows at all'}.`
    );
  }
  return target.index;
}

function patchTable(
  table: CanvasTableBlock,
  patch: { header?: string[]; rows?: string[][] }
): CanvasTableBlock {
  const header = patch.header ?? table.header;
  const rows = patch.rows ?? table.rows;
  for (const [index, row] of rows.entries()) {
    if (row.length !== header.length) {
      throw new Error(
        `Row ${index} has ${row.length} cells but the table has ${header.length} columns. Every row needs one cell per column.`
      );
    }
  }
  return { header, rows, type: 'table' };
}

async function writeCanvasTable({
  canvasId,
  markdown,
}: {
  canvasId: string;
  markdown: string;
}): Promise<void> {
  try {
    await slack.webClient.canvases.edit({
      canvas_id: canvasId,
      changes: [
        {
          document_content: { markdown, type: 'markdown' as const },
          operation: 'replace',
        },
      ],
    });
  } catch (error) {
    throw canvasEditError(canvasId, error);
  }
}

async function assertTableWritten({
  canvasId,
  expected,
  currentThreadId,
  tablesBefore,
}: {
  canvasId: string;
  currentThreadId?: string;
  expected: CanvasTableBlock;
  tablesBefore: number;
}): Promise<void> {
  const { html } = await readCanvasHtml({ canvasId, currentThreadId });
  const tables = tableBlocks(canvasHtmlToBlocks(html));
  if (tables.length !== tablesBefore) {
    throw new Error(
      `Wrote canvas ${canvasId} but it now holds ${tables.length} tables instead of ${tablesBefore}, so the rewrite added or lost content. Open the canvas and check it.`
    );
  }
  const written = tables.find(
    (table) =>
      table.block.header.join('\u0000') === expected.header.join('\u0000') &&
      table.block.rows.length === expected.rows.length
  );
  if (!written) {
    throw new Error(
      `Wrote canvas ${canvasId} but can't find the updated table in it afterwards. Open the canvas and check it.`
    );
  }
}

export const updateCanvasTableTool = createTool({
  id: 'update_canvas_table',
  description:
    "Replace the contents of one existing table in a Slack canvas. Use this instead of edit_canvas for tables: replace on a section id only swaps the block that owns the id and leaves the table sitting under that heading behind, which duplicates the table. Slack has no addressable id for a table or its cells, so this reads the canvas, rewrites it in one whole-document replace, then checks the table and the table count came out right. Prefer match by section, then by firstCell, then by index. It refuses rather than guessing when the canvas holds something that can't be written back as markdown (mentions, images, checklists, nested formatting).",
  inputSchema: input({
    canvasId: canvasIdSchema,
    match: tableMatchSchema,
    header: z
      .array(z.string())
      .min(1)
      .optional()
      .describe('New header cells. Omit to keep the existing header.'),
    rows: z
      .array(z.array(z.string()))
      .optional()
      .describe('New data rows. Omit to keep the existing rows.'),
    dryRun: z
      .boolean()
      .default(false)
      .describe('Return the markdown it would write without writing it.'),
  }).refine(({ header, rows }) => header || rows, {
    message: 'Provide header, rows, or both.',
  }),
  outputSchema: output({
    canvasId: z.string(),
    tableIndex: z.number().int(),
    header: z.array(z.string()),
    rowCount: z.number().int(),
    markdown: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Updated table ${(output?.tableIndex ?? 0) + 1} in canvas ${output?.canvasId ?? ''}`,
      }),
    },
  },
  execute: async ({ canvasId, match, header, rows, dryRun }, context) => {
    spendSlackCall(context?.requestContext);

    const ctx = channelContext(context.requestContext);
    const { html } = await readCanvasHtml({
      canvasId,
      currentThreadId: ctx.threadId,
    });
    const blocks = canvasHtmlToBlocks(html);
    const tableIndex = findTableIndex(blocks, match);
    const current = blocks[tableIndex];
    if (current?.type !== 'table') {
      throw new Error(
        `Block ${tableIndex} in canvas ${canvasId} is not a table.`
      );
    }

    const next = patchTable(current, {
      ...(header ? { header } : {}),
      ...(rows ? { rows } : {}),
    });
    const markdown = blocksToMarkdown(
      blocks.map((block, index) => (index === tableIndex ? next : block))
    );
    const result = {
      canvasId,
      header: next.header,
      rowCount: next.rows.length,
      tableIndex,
    };

    if (dryRun) {
      return { ...result, markdown };
    }

    await writeCanvasTable({ canvasId, markdown });
    await assertTableWritten({
      canvasId,
      currentThreadId: ctx.threadId,
      expected: next,
      tablesBefore: tableBlocks(blocks).length,
    });
    return result;
  },
});
