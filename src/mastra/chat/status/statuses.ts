import { z } from 'zod';
import { fileName, fit } from './format';

const text = z.string().min(1).optional().catch(undefined);

const argsSchema = z
  .object({
    action: text,
    code: text,
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

function withArg({
  key,
  idle,
  prefix,
  suffix,
  display = (value) => value,
}: {
  key: Exclude<keyof Args, 'target'>;
  idle: string;
  prefix: string;
  suffix: string;
  display?: (value: string) => string;
}) {
  return (args: Args) => {
    const value = args[key];
    return value ? fit({ prefix, content: display(value), suffix }) : idle;
  };
}

function fixed(text: string) {
  return () => text;
}

const statuses: Record<string, (args: Args) => string> = {
  create_canvas: withArg({
    key: 'title',
    idle: 'is creating a canvas…',
    prefix: 'is creating the canvas "',
    suffix: '"…',
  }),
  create_scheduled_task: (args) => {
    const name = args.name ?? args.task;
    return name
      ? fit({ prefix: 'is scheduling "', content: name, suffix: '"…' })
      : 'is scheduling a task…';
  },
  delete_file: withArg({
    key: 'path',
    idle: 'is deleting a file…',
    prefix: 'is deleting ',
    suffix: '…',
    display: fileName,
  }),
  delete_scheduled_task: fixed('is deleting a scheduled task…'),
  edit_canvas: fixed('is editing a canvas…'),
  edit_file: withArg({
    key: 'path',
    idle: 'is editing a file…',
    prefix: 'is editing ',
    suffix: '…',
    display: fileName,
  }),
  execute_command: withArg({
    key: 'command',
    idle: 'is running a command…',
    prefix: 'is running `',
    suffix: '`…',
  }),
  fetch_url: ({ url }) =>
    url && URL.canParse(url)
      ? fit({
          prefix: 'is reading ',
          content: new URL(url).hostname,
          suffix: '…',
        })
      : 'is reading a web page…',
  file_stat: withArg({
    key: 'path',
    idle: 'is checking a file…',
    prefix: 'is checking ',
    suffix: '…',
    display: fileName,
  }),
  generate_image: withArg({
    key: 'prompt',
    idle: 'is generating an image…',
    prefix: 'is generating an image of "',
    suffix: '"…',
  }),
  get_channel_info: fixed('is checking a channel…'),
  get_permalink: fixed('is getting a Slack link…'),
  get_process_output: withArg({
    key: 'pid',
    idle: 'is checking a process…',
    prefix: 'is checking process ',
    suffix: '…',
  }),
  get_slack_emoji: withArg({
    key: 'name',
    idle: 'is looking at an emoji…',
    prefix: 'is looking at :',
    suffix: ':…',
    display: (name) => name.replaceAll(':', ''),
  }),
  get_slack_file: fixed('is downloading a Slack file…'),
  get_user: fixed('is looking up a user…'),
  grep: withArg({
    key: 'pattern',
    idle: 'is searching files…',
    prefix: 'is searching files for "',
    suffix: '"…',
  }),
  kill_process: withArg({
    key: 'pid',
    idle: 'is stopping a process…',
    prefix: 'is stopping process ',
    suffix: '…',
  }),
  join_thread: fixed('is rejoining the thread…'),
  leave_thread: fixed('is leaving the thread…'),
  list_canvases: withArg({
    key: 'query',
    idle: 'is listing canvases…',
    prefix: 'is listing canvases: "',
    suffix: '"…',
  }),
  list_channels: withArg({
    key: 'query',
    idle: 'is listing channels…',
    prefix: 'is listing channels: "',
    suffix: '"…',
  }),
  list_files: ({ path }) =>
    path && path !== '.'
      ? fit({ prefix: 'is listing ', content: fileName(path), suffix: '…' })
      : 'is listing files…',
  list_scheduled_tasks: fixed('is checking scheduled tasks…'),
  list_threads: fixed('is listing threads…'),
  load_tool: fixed('is loading a tool…'),
  lookup_canvas_sections: fixed('is inspecting a canvas…'),
  pause_scheduled_task: fixed('is pausing a scheduled task…'),
  post_message: ({ target }) => {
    if (target?.type === 'user') {
      return 'is sending a DM…';
    }
    if (target?.type === 'channel' || target?.type === 'thread') {
      return `is sending a message to the ${target.type}…`;
    }
    return 'is sending a message…';
  },
  react: ({ action, emoji }) => {
    if (!emoji) {
      return 'is adding a reaction…';
    }
    return fit({
      prefix: action === 'remove' ? 'is removing a :' : 'is adding a :',
      content: emoji,
      suffix: ': reaction…',
    });
  },
  read_canvas: fixed('is reading a canvas…'),
  read_conversation_history: fixed('is reading Slack history…'),
  read_file: withArg({
    key: 'path',
    idle: 'is reading a file…',
    prefix: 'is reading ',
    suffix: '…',
    display: fileName,
  }),
  resume_scheduled_task: fixed('is resuming a scheduled task…'),
  run_background: withArg({
    key: 'reason',
    idle: 'is starting a background job…',
    prefix: 'is starting a background job: ',
    suffix: '…',
  }),
  search_slack: withArg({
    key: 'query',
    idle: 'is searching Slack…',
    prefix: 'is searching Slack for "',
    suffix: '"…',
  }),
  search_tools: withArg({
    key: 'query',
    idle: 'is looking for a tool…',
    prefix: 'is looking for a tool: "',
    suffix: '"…',
  }),
  search_web: withArg({
    key: 'query',
    idle: 'is searching the web…',
    prefix: 'is searching the web for "',
    suffix: '"…',
  }),
  skill: withArg({
    key: 'name',
    idle: 'is loading a skill…',
    prefix: 'is loading the ',
    suffix: ' skill…',
  }),
  skill_search: withArg({
    key: 'query',
    idle: 'is looking for a skill…',
    prefix: 'is looking for a skill: "',
    suffix: '"…',
  }),
  slack: ({ code }) => {
    const calls = new Set(
      Array.from(
        code?.matchAll(/external_(\w+)\s*\(/g) ?? [],
        ([, name]) => name
      )
    );
    return calls.size > 0
      ? fit({
          prefix: 'is calling ',
          content: [...calls].join(', '),
          suffix: '…',
        })
      : 'is working in Slack…';
  },
  submit_feedback: ({ kind }) =>
    kind && kind !== 'other'
      ? fit({ prefix: 'is passing on your ', content: kind, suffix: '…' })
      : 'is passing on your feedback…',
  summarize_thread: withArg({
    key: 'instructions',
    idle: 'is summarizing the thread…',
    prefix: 'is summarizing: ',
    suffix: '…',
  }),
  upload_emoji: withArg({
    key: 'name',
    idle: 'is adding an emoji…',
    prefix: 'is adding the :',
    suffix: ': emoji…',
  }),
  upload_file: fixed('is uploading a file…'),
  view_image: withArg({
    key: 'path',
    idle: 'is looking at an image…',
    prefix: 'is looking at ',
    suffix: '…',
    display: fileName,
  }),
  wait: withArg({
    key: 'reason',
    idle: 'is waiting…',
    prefix: 'is waiting: ',
    suffix: '…',
  }),
  write_file: withArg({
    key: 'path',
    idle: 'is writing a file…',
    prefix: 'is writing ',
    suffix: '…',
    display: fileName,
  }),
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
