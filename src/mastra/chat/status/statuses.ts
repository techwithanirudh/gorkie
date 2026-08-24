import { type Args, fileName, fit, str } from './format';

export const statuses: Record<string, (args: Args) => string> = {
  call_slack_api: (args) => {
    const method = str(args, 'method');
    return method
      ? fit('is calling the Slack API: ', method, '…')
      : 'is calling the Slack API…';
  },
  create_canvas: (args) => {
    const title = str(args, 'title');
    return title
      ? fit('is creating the canvas "', title, '"…')
      : 'is creating a canvas…';
  },
  create_scheduled_task: (args) => {
    const name = str(args, 'name') ?? str(args, 'task');
    return name ? fit('is scheduling "', name, '"…') : 'is scheduling a task…';
  },
  delete_file: (args) => {
    const path = str(args, 'path');
    return path
      ? fit('is deleting ', fileName(path), '…')
      : 'is deleting a file…';
  },
  delete_scheduled_task: () => 'is deleting a scheduled task…',
  edit_canvas: () => 'is editing a canvas…',
  edit_file: (args) => {
    const path = str(args, 'path');
    return path
      ? fit('is editing ', fileName(path), '…')
      : 'is editing a file…';
  },
  execute_command: (args) => {
    const command = str(args, 'command');
    return command
      ? fit('is running `', command, '`…')
      : 'is running a command…';
  },
  fetch_url: (args) => {
    const url = str(args, 'url');
    if (!url) {
      return 'is reading a web page…';
    }
    try {
      return fit('is reading ', new URL(url).hostname, '…');
    } catch {
      return 'is reading a web page…';
    }
  },
  file_stat: (args) => {
    const path = str(args, 'path');
    return path
      ? fit('is checking ', fileName(path), '…')
      : 'is checking a file…';
  },
  generate_image: (args) => {
    const prompt = str(args, 'prompt');
    return prompt
      ? fit('is generating an image of "', prompt, '"…')
      : 'is generating an image…';
  },
  get_channel_info: () => 'is checking a channel…',
  get_permalink: () => 'is getting a Slack link…',
  get_process_output: (args) => {
    const pid = str(args, 'pid');
    return pid
      ? fit('is checking process ', pid, '…')
      : 'is checking a process…';
  },
  get_slack_file: () => 'is downloading a Slack file…',
  get_user: () => 'is looking up a user…',
  grep: (args) => {
    const pattern = str(args, 'pattern');
    return pattern
      ? fit('is searching files for "', pattern, '"…')
      : 'is searching files…';
  },
  kill_process: (args) => {
    const pid = str(args, 'pid');
    return pid
      ? fit('is stopping process ', pid, '…')
      : 'is stopping a process…';
  },
  leave_thread: () => 'is leaving the thread…',
  list_canvases: (args) => {
    const query = str(args, 'query');
    return query
      ? fit('is listing canvases: "', query, '"…')
      : 'is listing canvases…';
  },
  list_channels: (args) => {
    const query = str(args, 'query');
    return query
      ? fit('is listing channels: "', query, '"…')
      : 'is listing channels…';
  },
  list_files: (args) => {
    const path = str(args, 'path');
    return path && path !== '.'
      ? fit('is listing ', fileName(path), '…')
      : 'is listing files…';
  },
  list_scheduled_tasks: () => 'is checking scheduled tasks…',
  list_threads: () => 'is listing threads…',
  load_tool: () => 'is loading a tool…',
  lookup_canvas_sections: () => 'is inspecting a canvas…',
  pause_scheduled_task: () => 'is pausing a scheduled task…',
  post_message: (args) => {
    const target = args.target as { type?: string } | undefined;
    if (target?.type === 'user') {
      return 'is sending a DM…';
    }
    if (target?.type === 'channel' || target?.type === 'thread') {
      return `is sending a message to the ${target.type}…`;
    }
    return 'is sending a message…';
  },
  react: (args) => {
    const emoji = str(args, 'emoji');
    if (!emoji) {
      return 'is adding a reaction…';
    }
    return args.action === 'remove'
      ? fit('is removing a :', emoji, ': reaction…')
      : fit('is adding a :', emoji, ': reaction…');
  },
  read_canvas: () => 'is reading a canvas…',
  read_conversation_history: () => 'is reading Slack history…',
  read_file: (args) => {
    const path = str(args, 'path');
    return path
      ? fit('is reading ', fileName(path), '…')
      : 'is reading a file…';
  },
  resume_scheduled_task: () => 'is resuming a scheduled task…',
  search_slack: (args) => {
    const query = str(args, 'query');
    return query
      ? fit('is searching Slack for "', query, '"…')
      : 'is searching Slack…';
  },
  search_web: (args) => {
    const query = str(args, 'query');
    return query
      ? fit('is searching the web for "', query, '"…')
      : 'is searching the web…';
  },
  search_tools: (args) => {
    const query = str(args, 'query');
    return query
      ? fit('is looking for a tool: "', query, '"…')
      : 'is looking for a tool…';
  },
  skill_search: (args) => {
    const query = str(args, 'query');
    return query
      ? fit('is looking for a skill: "', query, '"…')
      : 'is looking for a skill…';
  },
  slack: () => 'is working in Slack…',
  submit_feedback: (args) => {
    const kind = str(args, 'kind');
    return kind && kind !== 'other'
      ? fit('is passing on your ', kind, '…')
      : 'is passing on your feedback…';
  },
  summarize_thread: (args) => {
    const instructions = str(args, 'instructions');
    return instructions
      ? fit('is summarizing: ', instructions, '…')
      : 'is summarizing the thread…';
  },
  upload_emoji: (args) => {
    const name = str(args, 'name');
    return name
      ? fit('is adding the :', name, ': emoji…')
      : 'is adding an emoji…';
  },
  upload_file: () => 'is uploading a file…',
  wait: (args) => {
    const reason = str(args, 'reason');
    return reason ? fit('is waiting: ', reason, '…') : 'is waiting…';
  },
  write_file: (args) => {
    const path = str(args, 'path');
    return path
      ? fit('is writing ', fileName(path), '…')
      : 'is writing a file…';
  },
};
