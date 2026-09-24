import { sandbox } from '../../config';

export function codeModePrompt({
  instructions,
  files,
}: {
  instructions: string;
  files: boolean;
}): string {
  return `\
<code-mode>
Slack code mode is for several Slack reads, paging, filtering, joining, deduplication, sorting, counting, aggregation, and MCP tool calls that benefit from code-side orchestration. Use direct tools for single lookups. Only the external_* functions declared below can reach your tools. Return final results, not intermediate pages.

Reads are metered per call, and the workspace's rate limit is shared with everyone else using Slack. Ask for the narrowest range that answers the question, prefer a bigger page size over more pages, stop as soon as you have enough, and say what you sampled rather than silently reading everything. A turn that runs past its call budget is cut off mid-program, losing every page it had read but not yet written down.

Every path through the program must \`return\` a value, and it has to be the last thing that happens. A bare \`return\`, falling off the end, or returning only inside an \`if\` throws away everything the program did: the reads are still spent, the turn still costs, and you get nothing back. Write to a file first if you need to, then return. Keep what you return small enough to read in a message, so counts, the few records that matter, or a path, never the rows themselves.

${instructions}
${
  files
    ? `
<files>
Ignore the rule above about having no filesystem access. Your program runs as Node inside this thread's E2B sandbox, the same one the direct file tools and execute_command act on, and external_read_file, external_write_file, external_edit_file, external_list_files, external_file_stat, external_delete_file, external_grep, and external_execute_command take the same arguments there as their direct counterparts.

Anything you read in bulk goes to a file, not into your return value: full channel or thread exports, every page of a paginated read, the per-message records behind a count. Write the file, then return the path with a count and a couple of sample rows. This is the normal shape of a program that reads a lot, not a fallback for when the result gets too big, and a return value over the size limit is rejected outright, so the rows would be lost anyway.

const rows = pages.flatMap((page) => page.messages);
await external_write_file({ path: '${sandbox.workdir}/thread-export.json', content: JSON.stringify(rows, null, 2) });
return { path: '${sandbox.workdir}/thread-export.json', count: rows.length, sample: rows.slice(0, 3) };

Overwriting a file that already exists requires reading it earlier in the same program; a new path needs no read. Node built-ins also work, but the program body is a function body, so load them with dynamic import (const { writeFile } = await import('node:fs/promises')) instead of a top-level import.

external_read_file returns what the direct read_file shows you: a header line, then numbered lines, cut off on a large file. It is never the raw file, so JSON.parse on it always fails. To load a file's data inside the program, read it with Node:

const { readFile } = await import('node:fs/promises');
const rows = JSON.parse(await readFile('${sandbox.workdir}/thread-export.json', 'utf8'));

An image read in code mode comes back as base64 text, not a picture. To look at an image, call view_image directly, outside code mode.

Paths must stay under ${sandbox.workdir}. Files persist for the whole thread, so a later turn can read_file, grep, or execute_command over them, or upload_file the result to Slack.
</files>
`
    : ''
}</code-mode>`;
}
