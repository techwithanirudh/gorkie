// TODO(slopradar): CODING_STANDARDS: naming | `utils.ts` names a junk drawer for one shell-quoting function | rename to lib/shell.ts and update its 5 importers (workspace/ripgrep.ts, tools/github/{push,git,checkout}.ts, tools/slack/get-slack-file.ts)
export function sh(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
