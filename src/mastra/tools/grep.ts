import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { sh } from '../lib/shell';
import { resolveE2BSandbox } from '../workspace';

const MAX_OUTPUT_LINES = 500;

interface RgMatchRecord {
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches?: { start: number }[];
  };
  type: 'match' | 'context';
}

export const grepTool = createTool({
  id: 'grep',
  description:
    'Search file contents using a regex pattern via ripgrep. Fast native search inside the sandbox. Respects .gitignore by default.',
  inputSchema: z.object({
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
  execute: async (
    { pattern, path, contextLines, maxCount, caseSensitive, includeHidden },
    context
  ) => {
    if (!context?.requestContext) {
      throw new Error('No workspace context.');
    }
    const sandbox = await resolveE2BSandbox(context.requestContext);
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
      // rg exits 1 for "no matches" (not an error) and 2 for real errors
      // (e.g. invalid regex); E2B throws CommandExitError on any non-zero exit.
      const exit = error as {
        exitCode?: number;
        stdout?: string;
        stderr?: string;
      };
      if (exit.exitCode === 1) {
        return {
          success: true,
          matches: 0,
          message: `No matches for "${pattern}".`,
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
      let record: RgMatchRecord;
      try {
        record = JSON.parse(line) as RgMatchRecord;
      } catch {
        continue;
      }
      if (record.type !== 'match' && record.type !== 'context') {
        continue;
      }
      const { path: filePath, lines, line_number: lineNumber } = record.data;
      const text = lines.text.replace(/\n$/, '');
      let fileLines = byFile.get(filePath.text);
      if (!fileLines) {
        fileLines = [];
        byFile.set(filePath.text, fileLines);
        fileOrder.push(filePath.text);
      }
      if (record.type === 'match') {
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
        success: true,
        matches: 0,
        message: `No matches for "${pattern}".`,
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
      success: true,
      matches: matchCount,
      output: output.join('\n'),
      message: `${matchCount} matching line${matchCount === 1 ? '' : 's'} for "${pattern}"${truncated ? ' (truncated)' : ''}.`,
    };
  },
});
