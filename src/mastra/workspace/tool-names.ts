export const READ_FILE = 'read_file';
export const WRITE_FILE = 'write_file';
export const EDIT_FILE = 'edit_file';
export const LIST_FILES = 'list_files';
export const GREP = 'grep';
export const DELETE_FILE = 'delete_file';
export const FILE_STAT = 'file_stat';
export const EXECUTE_COMMAND = 'execute_command';
export const GET_PROCESS_OUTPUT = 'get_process_output';
export const KILL_PROCESS = 'kill_process';

export const codeModeToolNames = new Set([
  READ_FILE,
  WRITE_FILE,
  EDIT_FILE,
  LIST_FILES,
  GREP,
  DELETE_FILE,
  FILE_STAT,
  EXECUTE_COMMAND,
]);

export const workspaceToolNames = new Set([
  ...codeModeToolNames,
  GET_PROCESS_OUTPUT,
  KILL_PROCESS,
]);
