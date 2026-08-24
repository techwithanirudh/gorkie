import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { sh } from '../lib/utils';
import { input, output } from '../types/tools/index';
import { getSandbox } from '../workspace';

const MAX_OUTPUT_LINES = 500;

const rgMatchRecordSchema = z.object({
  data: z.object({
    path: z.object({ text: z.string() }),
    lines: z.object({ text: z.string() }),
    line_number: z.number(),
  }),
  type: z.enum(['match', 'context']),
});

const commandErrorSchema = z.looseObject({
  exitCode: z.number().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
});

export const grepTool = createTool({
  id: 'grep',
  description:
    'Search file contents using a regex pattern via ripgrep. Fast native search inside the sandbox. Respects .gitignore by default.',
  inputSchema: input({
    pattern: z.string().min(1).describe('Regex pattern to search for.'),
    path: z
      .string()
      .optional()
      .default('.')
      .describe(
        'File, directory, or glob pattern to search within (default: "."). A glob (e.g. "**/*.ts") filters which files to search.'
      ),
    contextLines: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe(
        'Number of lines of context to include before and after each match (default: 0).'
      ),
    maxCount: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Maximum matches per file. Moves on to the next file after this many matches.'
      ),
    caseSensitive: z
      .boolean()
      .optional()
      .default(true)
      .describe('Whether the search is case-sensitive (default: true).'),
    includeHidden: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include hidden files and directories (default: false).'),
  }),
  outputSchema: output({
    matches: z.number().int().min(0),
    output: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ input, output }) => ({
        summary: `Found ${output?.matches ?? 0} matches for "${input?.pattern ?? ''}" in ${input?.path ?? '.'}`,
      }),
    },
  },
  execute: async (
    { pattern, path, contextLines, maxCount, caseSensitive, includeHidden },
    context
  ) => {
    if (!context?.requestContext) {
      throw new Error('No workspace context.');
    }
    const sandbox = await getSandbox(context.requestContext);
    if (!sandbox) {
      throw new Error('No sandbox available.');
    }
    await sandbox.ensureRunning();

    const args = ['--json', '--no-config', '--glob=!**/.git/**'];
    if (!caseSensitive) {
      args.push('--ignore-case');
    }
    if (includeHidden) {
      args.push('--hidden');
    }
    if (contextLines > 0) {
      args.push('-C', String(contextLines));
    }
    if (maxCount !== undefined) {
      args.push('-m', String(maxCount));
    }
    const isGlob = /[*?{}[\]]/.test(path);
    if (isGlob) {
      args.push(`--glob=${sh(path)}`);
    }
    args.push('--', sh(pattern));
    if (!isGlob) {
      args.push(sh(path));
    }

    const command = `rg ${args.join(' ')}`;
    let stdout: string;
    try {
      ({ stdout } = await sandbox.retryOnDead(() =>
        sandbox.e2b.commands.run(command, {
          timeoutMs: 30 * 1000,
        })
      ));
    } catch (error) {
      // ripgrep uses exit 1 for no matches and 2 for errors.
      const exit = commandErrorSchema.safeParse(error).data ?? {};
      if (exit.exitCode === 1) {
        return {
          matches: 0,
        };
      }
      throw new Error(
        `grep failed (exit ${exit.exitCode}): ${exit.stderr || exit.stdout || String(error)}`,
        { cause: error }
      );
    }

    const fileOrder: string[] = [];
    const byFile = new Map<string, string[]>();
    let matchCount = 0;
    let lineCount = 0;
    let truncated = false;
    for (const line of stdout.split('\n')) {
      if (!line) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const record = rgMatchRecordSchema.safeParse(parsed);
      if (!record.success) {
        continue;
      }
      const {
        path: filePath,
        lines,
        line_number: lineNumber,
      } = record.data.data;
      const text = lines.text.replace(/\n$/, '');
      let fileLines = byFile.get(filePath.text);
      if (!fileLines) {
        fileLines = [];
        byFile.set(filePath.text, fileLines);
        fileOrder.push(filePath.text);
      }
      if (record.data.type === 'match') {
        matchCount += 1;
        fileLines.push(`  Line ${lineNumber}: ${text}`);
      } else {
        fileLines.push(`  Line ${lineNumber}- ${text}`);
      }
      lineCount += 1;
      if (lineCount >= MAX_OUTPUT_LINES) {
        truncated = true;
        break;
      }
    }

    if (matchCount === 0) {
      return {
        matches: 0,
      };
    }

    const output = [
      `Found ${matchCount} match${matchCount === 1 ? '' : 'es'}${truncated ? ' (truncated)' : ''}`,
      ...fileOrder.flatMap((file) => [
        '',
        `${file}:`,
        ...(byFile.get(file) ?? []),
      ]),
    ];
    if (truncated) {
      output.push(
        '',
        `(Results truncated at ${MAX_OUTPUT_LINES} lines. Consider using a more specific path or pattern.)`
      );
    }

    return {
      matches: matchCount,
      output: output.join('\n'),
    };
  },
});
