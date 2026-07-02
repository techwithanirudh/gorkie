import { Agent } from '@mastra/core/agent';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import { stepCountIs } from '../lib/tools';
import { sandbox } from '../processors/sandbox';
import { orchestrator } from '../providers';
import { baseTools } from '../tools/base';
import { workspace } from '../workspace';

export const executeAgent = new Agent({
  id: 'execute',
  name: 'Execute',
  description:
    'Makes focused workspace changes and runs verification commands for a scoped task.',
  instructions:
    'You are Execute. Make focused workspace changes for the requested task, run necessary verification, and report what changed plus checks. Keep edits scoped. Do not post Slack messages or upload files unless explicitly asked.',
  model: orchestrator,
  workspace,
  tools: baseTools,
  inputProcessors: [
    new TokenLimiterProcessor({ limit: 900_000, trimMode: 'contiguous' }),
  ],
  defaultOptions: {
    activeTools: [
      'read_file',
      'write_file',
      'edit_file',
      'list_files',
      'grep',
      'delete_file',
      'file_stat',
      'mkdir',
      'ast_edit',
      'execute_command',
      'get_process_output',
      'kill_process',
    ],
    modelSettings: { maxOutputTokens: 16_384 },
    stopWhen: stepCountIs(120),
  },
  outputProcessors: [sandbox],
});
