export const toolNames = {
  readFile: 'read_file',
  writeFile: 'write_file',
  editFile: 'edit_file',
  listFiles: 'list_files',
  grep: 'grep',
  deleteFile: 'delete_file',
  fileStat: 'file_stat',
  executeCommand: 'execute_command',
  getProcessOutput: 'get_process_output',
  killProcess: 'kill_process',
} as const;

export const codeModeToolNames = new Set<string>([
  toolNames.readFile,
  toolNames.writeFile,
  toolNames.editFile,
  toolNames.listFiles,
  toolNames.grep,
  toolNames.deleteFile,
  toolNames.fileStat,
  toolNames.executeCommand,
]);
