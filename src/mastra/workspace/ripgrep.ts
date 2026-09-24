import path from 'node:path';
import type {
  FilesystemGrepMatch,
  FilesystemGrepOptions,
  FilesystemGrepResult,
} from '@mastra/core/workspace';
import { z } from 'zod';
import { file as fileConfig } from '../config';
import { sh } from '../lib/utils';

const arbitraryData = z.union([
  z.object({ text: z.string() }),
  z.object({ bytes: z.string() }),
]);

const ripgrepEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['match', 'context']),
    data: z.object({
      line_number: z.number(),
      lines: arbitraryData,
      path: arbitraryData,
      submatches: z.array(z.object({ start: z.number() })),
    }),
  }),
  z.object({ type: z.enum(['begin', 'end', 'summary']) }),
]);

// ripgrep emits non-UTF-8 paths and lines as base64 `bytes` instead of `text`.
function rawBytes(data: z.infer<typeof arbitraryData>): Buffer {
  return 'text' in data
    ? Buffer.from(data.text, 'utf-8')
    : Buffer.from(data.bytes, 'base64');
}

function contiguousLines({
  lines,
  count,
  from,
  step,
}: {
  lines: Map<number, string>;
  count: number;
  from: number;
  step: 1 | -1;
}): string[] {
  const found: string[] = [];
  let text = lines.get(from);
  while (text !== undefined && found.length < count) {
    found.push(text);
    text = lines.get(from + step * found.length);
  }
  return step === 1 ? found : found.reverse();
}

export function ripgrepCommand({
  caseSensitive,
  contextLines = 0,
  includeHidden,
  maxCountPerFile,
  maxTotalMatches,
  pattern,
  root,
}: FilesystemGrepOptions & { root: string }): string {
  const args = [
    'rg',
    '--no-config',
    '--json',
    // Rust regex first, PCRE2 only for lookaround and backreferences, so most
    // JS patterns run natively instead of falling back to the host-side walk.
    '--engine',
    'auto',
    '--sort',
    'path',
    caseSensitive ? '--case-sensitive' : '--ignore-case',
  ];
  if (includeHidden) {
    args.push('--hidden', '--glob', sh('!.git'));
  }
  if (maxCountPerFile !== undefined) {
    args.push('--max-count', String(Math.max(1, Math.ceil(maxCountPerFile))));
  }
  if (contextLines > 0) {
    args.push('--context', String(contextLines));
  }
  args.push('--regexp', sh(pattern), '--', sh(root));

  // Every match costs at most one line plus its context, and each file adds a
  // begin and end event, so this line cap keeps enough output for
  // maxTotalMatches without shipping a huge tree's worth back over the E2B API.
  const caps =
    maxTotalMatches === undefined
      ? []
      : [`head -n ${maxTotalMatches * (2 * contextLines + 3) + 1}`];
  caps.push(`head -c ${fileConfig.maxGrepOutputBytes}`);

  // Exit 1 is "no matches" and 141 is SIGPIPE from `head` closing early; both
  // are successful searches. $PIPESTATUS is bash-only, which E2B runs.
  return [
    `${args.join(' ')} | ${caps.join(' | ')}`,
    'status=$PIPESTATUS',
    'if [ "$status" -eq 1 ] || [ "$status" -eq 141 ]; then exit 0; fi',
    'exit "$status"',
  ].join('\n');
}

export function parseRipgrepJson({
  output,
  contextLines = 0,
  maxTotalMatches = Number.POSITIVE_INFINITY,
  root,
}: {
  output: string;
  contextLines?: number;
  maxTotalMatches?: number;
  root: string;
}): FilesystemGrepResult[] {
  const lines = output.split('\n');
  lines.pop();

  const files: {
    path: string;
    lines: Map<number, string>;
    matches: FilesystemGrepMatch[];
  }[] = [];
  let total = 0;
  for (const line of lines) {
    const event = ripgrepEvent.parse(JSON.parse(line));
    if (!(event.type === 'match' || event.type === 'context')) {
      continue;
    }
    const filePath = path.posix.relative(
      root,
      rawBytes(event.data.path).toString('utf-8')
    );
    let file = files.at(-1);
    if (file?.path !== filePath) {
      if (total >= maxTotalMatches) {
        break;
      }
      file = { path: filePath, lines: new Map(), matches: [] };
      files.push(file);
    }

    const bytes = rawBytes(event.data.lines);
    const text = bytes.toString('utf-8').replace(/\n$/, '');
    file.lines.set(event.data.line_number, text);
    if (event.type === 'match' && total < maxTotalMatches) {
      // ripgrep reports byte offsets; Mastra wants a UTF-16 column.
      const start = event.data.submatches[0]?.start ?? 0;
      file.matches.push({
        line: event.data.line_number,
        column: bytes.subarray(0, start).toString('utf-8').length,
        text,
      });
      total += 1;
    }
  }

  return files
    .filter((file) => file.matches.length > 0)
    .map((file) => ({
      path: file.path,
      matches:
        contextLines === 0
          ? file.matches
          : file.matches.map((match) => ({
              ...match,
              before: contiguousLines({
                lines: file.lines,
                count: contextLines,
                from: match.line - 1,
                step: -1,
              }),
              after: contiguousLines({
                lines: file.lines,
                count: contextLines,
                from: match.line + 1,
                step: 1,
              }),
            })),
    }));
}
