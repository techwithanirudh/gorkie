import { z } from 'zod';
import { fileName, fit } from './format';

const text = z.string().min(1).optional().catch(undefined);

const argsSchema = z
  .object({
    action: text,
    command: text,
    emoji: text,
    instructions: text,
    kind: text,
    name: text,
    path: text,
    pattern: text,
    pid: text,
    prompt: text,
    query: text,
    reason: text,
    target: z.object({ type: text }).optional().catch(undefined),
    task: text,
    title: text,
    url: text,
  })
  .catch({});

type Args = z.infer<typeof argsSchema>;

const statuses: Record<string, (args: Args) => string> = {
  create_canvas: (args) => {
    const { title } = args;
    return title
      ? fit({
          prefix: 'is creating the canvas "',
          content: title,
          suffix: '"…',
        })
      : 'is creating a canvas…';
  },
  create_scheduled_task: (args) => {
    const name = args.name ?? args.task;
    return name
      ? fit({ prefix: 'is scheduling "', content: name, suffix: '"…' })
      : 'is scheduling a task…';
  },
  delete_file: (args) => {
    const { path } = args;
    return path
      ? fit({ prefix: 'is deleting ', content: fileName(path), suffix: '…' })
      : 'is deleting a file…';
  },
  delete_scheduled_task: () => 'is deleting a scheduled task…',
  edit_canvas: () => 'is editing a canvas…',
  edit_file: (args) => {
    const { path } = args;
    return path
      ? fit({ prefix: 'is editing ', content: fileName(path), suffix: '…' })
      : 'is editing a file…';
  },
  execute_command: (args) => {
    const { command } = args;
    return command
      ? fit({ prefix: 'is running `', content: command, suffix: '`…' })
      : 'is running a command…';
  },
  fetch_url: (args) => {
    const { url } = args;
    if (!url) {
      return 'is reading a web page…';
    }
    try {
      return fit({
        prefix: 'is reading ',
        content: new URL(url).hostname,
        suffix: '…',
      });
    } catch {
      return 'is reading a web page…';
    }
  },
  file_stat: (args) => {
    const { path } = args;
    return path
      ? fit({ prefix: 'is checking ', content: fileName(path), suffix: '…' })
      : 'is checking a file…';
  },
  generate_image: (args) => {
    const { prompt } = args;
    return prompt
      ? fit({
          prefix: 'is generating an image of "',
          content: prompt,
          suffix: '"…',
        })
      : 'is generating an image…';
  },
  get_channel_info: () => 'is checking a channel…',
  get_permalink: () => 'is getting a Slack link…',
  get_process_output: (args) => {
    const { pid } = args;
    return pid
      ? fit({ prefix: 'is checking process ', content: pid, suffix: '…' })
      : 'is checking a process…';
  },
  get_slack_file: () => 'is downloading a Slack file…',
  get_user: () => 'is looking up a user…',
  grep: (args) => {
    const { pattern } = args;
    return pattern
      ? fit({
          prefix: 'is searching files for "',
          content: pattern,
          suffix: '"…',
        })
      : 'is searching files…';
  },
  kill_process: (args) => {
    const { pid } = args;
    return pid
      ? fit({ prefix: 'is stopping process ', content: pid, suffix: '…' })
      : 'is stopping a process…';
  },
  leave_thread: () => 'is leaving the thread…',
  list_canvases: (args) => {
    const { query } = args;
    return query
      ? fit({ prefix: 'is listing canvases: "', content: query, suffix: '"…' })
      : 'is listing canvases…';
  },
  list_channels: (args) => {
    const { query } = args;
    return query
      ? fit({ prefix: 'is listing channels: "', content: query, suffix: '"…' })
      : 'is listing channels…';
  },
  list_files: (args) => {
    const { path } = args;
    return path && path !== '.'
      ? fit({ prefix: 'is listing ', content: fileName(path), suffix: '…' })
      : 'is listing files…';
  },
  list_scheduled_tasks: () => 'is checking scheduled tasks…',
  list_threads: () => 'is listing threads…',
  load_tool: () => 'is loading a tool…',
  lookup_canvas_sections: () => 'is inspecting a canvas…',
  pause_scheduled_task: () => 'is pausing a scheduled task…',
  post_message: (args) => {
    const { target } = args;
    if (target?.type === 'user') {
      return 'is sending a DM…';
    }
    if (target?.type === 'channel' || target?.type === 'thread') {
      return `is sending a message to the ${target.type}…`;
    }
    return 'is sending a message…';
  },
  react: (args) => {
    const { emoji } = args;
    if (!emoji) {
      return 'is adding a reaction…';
    }
    return args.action === 'remove'
      ? fit({
          prefix: 'is removing a :',
          content: emoji,
          suffix: ': reaction…',
        })
      : fit({ prefix: 'is adding a :', content: emoji, suffix: ': reaction…' });
  },
  read_canvas: () => 'is reading a canvas…',
  read_conversation_history: () => 'is reading Slack history…',
  read_file: (args) => {
    const { path } = args;
    return path
      ? fit({ prefix: 'is reading ', content: fileName(path), suffix: '…' })
      : 'is reading a file…';
  },
  resume_scheduled_task: () => 'is resuming a scheduled task…',
  search_slack: (args) => {
    const { query } = args;
    return query
      ? fit({
          prefix: 'is searching Slack for "',
          content: query,
          suffix: '"…',
        })
      : 'is searching Slack…';
  },
  search_web: (args) => {
    const { query } = args;
    return query
      ? fit({
          prefix: 'is searching the web for "',
          content: query,
          suffix: '"…',
        })
      : 'is searching the web…';
  },
  search_tools: (args) => {
    const { query } = args;
    return query
      ? fit({
          prefix: 'is looking for a tool: "',
          content: query,
          suffix: '"…',
        })
      : 'is looking for a tool…';
  },
  skill_search: (args) => {
    const { query } = args;
    return query
      ? fit({
          prefix: 'is looking for a skill: "',
          content: query,
          suffix: '"…',
        })
      : 'is looking for a skill…';
  },
  slack: () => 'is working in Slack…',
  submit_feedback: (args) => {
    const { kind } = args;
    return kind && kind !== 'other'
      ? fit({ prefix: 'is passing on your ', content: kind, suffix: '…' })
      : 'is passing on your feedback…';
  },
  summarize_thread: (args) => {
    const { instructions } = args;
    return instructions
      ? fit({ prefix: 'is summarizing: ', content: instructions, suffix: '…' })
      : 'is summarizing the thread…';
  },
  view_image: (args) => {
    const { path } = args;
    return path
      ? fit({ prefix: 'is looking at ', content: fileName(path), suffix: '…' })
      : 'is looking at an image…';
  },
  upload_emoji: (args) => {
    const { name } = args;
    return name
      ? fit({ prefix: 'is adding the :', content: name, suffix: ': emoji…' })
      : 'is adding an emoji…';
  },
  upload_file: () => 'is uploading a file…',
  wait: (args) => {
    const { reason } = args;
    return reason
      ? fit({ prefix: 'is waiting: ', content: reason, suffix: '…' })
      : 'is waiting…';
  },
  write_file: (args) => {
    const { path } = args;
    return path
      ? fit({ prefix: 'is writing ', content: fileName(path), suffix: '…' })
      : 'is writing a file…';
  },
};

export function toolStatus({
  args,
  toolName,
}: {
  args: unknown;
  toolName: string;
}): string | undefined {
  return statuses[toolName]?.(argsSchema.parse(args));
}
