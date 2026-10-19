import { posix } from 'node:path';
import { activity as config } from '../../config';
import { activityInputSchema } from '../../types/progress';

export const toolActions: Record<string, string | null> = {
  slack: 'checking Slack',
  search_web: 'searching the web',
  fetch_url: 'reading a page',
  search_slack: 'searching Slack',
  read_conversation_history: 'reading Slack history',
  get_user: 'looking up a user',
  get_channel_info: 'looking up a channel',
  list_channels: 'listing channels',
  list_threads: 'listing threads',
  get_permalink: 'getting a message link',
  summarize_thread: 'summarizing a thread',
  get_slack_file: 'downloading a Slack file',
  upload_file: 'uploading a file',
  view_image: 'looking at an image',
  generate_image: 'creating an image',
  upload_emoji: 'uploading an emoji',
  call_slack_api: 'checking Slack',
  post_card: 'preparing a response card',
  run_background: 'starting background work',
  read_artifact: 'reading research findings',
  save_artifact: 'saving research findings',
  submit_feedback: 'saving feedback',
  create_code_channel: 'opening a code channel',
  set_code_channel_view: 'updating a preview tab',
  update_code_channel: 'updating session context',
  set_code_channel_commands: 'updating code-channel commands',
  archive_code_channel: 'archiving the code channel',
  huddle_dj: 'sending a music command',
  huddle_dj_reply: 'checking the music command',
  join_huddle: 'joining the huddle',
  leave_huddle: 'leaving the huddle',
  create_canvas: 'writing a canvas',
  edit_canvas: 'editing a canvas',
  read_canvas: 'reading a canvas',
  list_canvases: 'listing canvases',
  lookup_canvas_sections: 'finding canvas sections',
  create_scheduled_task: 'scheduling a task',
  list_scheduled_tasks: 'checking scheduled tasks',
  pause_scheduled_task: 'pausing a scheduled task',
  resume_scheduled_task: 'resuming a scheduled task',
  delete_scheduled_task: 'deleting a scheduled task',
  agentmail_list_threads: 'checking email threads',
  agentmail_get_thread: 'reading an email thread',
  agentmail_list_messages: 'checking sent emails',
  agentmail_get_message: 'reading an email',
  agentmail_get_attachment: 'getting an email attachment',
  agentmail_send_message: 'sending an email',
  agentmail_reply_to_message: 'replying to an email',
  read_file: 'reading a file',
  write_file: 'writing a file',
  edit_file: 'editing a file',
  list_files: 'listing files',
  grep: 'searching files',
  delete_file: 'deleting a file',
  file_stat: 'checking file details',
  execute_command: 'running a command',
  get_process_output: 'reading command output',
  kill_process: 'stopping a command',
  search: 'searching workspace documents',
  index: 'indexing workspace documents',
  skill: 'reading a skill',
  skill_search: 'finding a skill',
  skill_read: 'reading a skill file',
  search_skills: 'finding a skill',
  list_skills: 'checking available skills',
  read_skill: 'reading a skill',
  read_skill_file: 'reading a skill file',
  search_tools: 'finding available tools',
  tool_search: 'finding available tools',
  'agent-research': 'researching the question',
  'agent-explore': 'exploring the workspace',
  github_checkout: 'checking out a repository',
  github_push_branch: 'pushing a branch',
  'context7_resolve-library-id': 'finding library documentation',
  'context7_query-docs': 'reading library documentation',
  github_add_assignees: 'assigning an issue',
  github_add_issue_comment: 'commenting on an issue',
  github_add_labels: 'labeling an issue',
  github_add_pull_request_comment: 'commenting on a pull request',
  github_close_issue: 'closing an issue',
  github_compare_commits: 'comparing commits',
  github_create_issue: 'creating an issue',
  github_create_pull_request: 'creating a pull request',
  github_get_ci_failure_context: 'investigating a failed build',
  github_get_commit: 'reading a commit',
  github_get_file_content: 'reading a repository file',
  github_get_issue_context: 'reading an issue',
  github_get_pull_request_context: 'reading a pull request',
  github_get_repository: 'checking a repository',
  github_get_repository_tree: 'listing repository files',
  github_list_branches: 'listing branches',
  github_list_check_runs: 'checking build results',
  github_list_commits: 'reading commit history',
  github_list_issue_comments: 'reading issue comments',
  github_list_issues: 'listing issues',
  github_list_labels: 'checking issue labels',
  github_list_pull_request_files: 'reading changed files',
  github_list_pull_request_reviews: 'reading pull request reviews',
  github_list_pull_requests: 'listing pull requests',
  github_remove_assignees: 'updating issue assignees',
  github_remove_label: 'updating issue labels',
  github_request_reviewers: 'requesting a review',
  github_search_code: 'searching repository code',
  github_search_issues: 'searching issues',
  github_search_repositories: 'finding repositories',
  github_update_issue: 'updating an issue',
  github_update_pull_request: 'updating a pull request',
  status_update: null,
  reply: null,
  skip: null,
  wait: null,
  react: null,
  post_message: null,
  ask_user: null,
  join_thread: null,
  leave_thread: null,
};

function shortTarget(text: string): string {
  return text
    .replace(/[\p{Cc}<>`*|]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, config.maxTargetChars);
}

export function toolActivity({
  toolName,
  args,
}: {
  toolName: string;
  args: unknown;
}): string | null {
  const name = toolName
    .replace(/^agent-(?:research|explore)_/, '')
    .replace(/^mastra_workspace_/, '');
  const label = Object.hasOwn(
    toolActions,
    name === 'delete' ? 'delete_file' : name
  )
    ? toolActions[name === 'delete' ? 'delete_file' : name]
    : 'working';
  if (label === null) {
    return null;
  }
  const parsed = activityInputSchema.safeParse(args);
  if (!parsed.success) {
    return label;
  }
  if (
    (name === 'slack' || name === 'execute_command') &&
    parsed.data.description
  ) {
    return (
      parsed.data.description
        .replace(/[\p{Cc}<>`*|]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, config.maxTitleChars) || label
    );
  }
  if ((name === 'search_slack' || name === 'search_web') && parsed.data.query) {
    const query = shortTarget(parsed.data.query);
    const page = parsed.data.cursor ? ' (next page)' : '';
    return query ? `${label}: ${query}${page}` : label;
  }
  if (
    name === 'read_conversation_history' ||
    name === 'list_threads' ||
    name === 'summarize_thread' ||
    name === 'get_permalink'
  ) {
    const reference =
      parsed.data.threadId ?? parsed.data.messageId ?? parsed.data.channelId;
    const link = URL.parse(reference ?? '');
    const source = link?.host
      ? link.pathname.replace(/^\/archives\//, '')
      : reference?.replace(/^slack:/, '');
    const target = source ? shortTarget(source) : '';
    const action =
      name === 'read_conversation_history' && parsed.data.threadId
        ? 'reading Slack thread'
        : label;
    const page = parsed.data.cursor ? ' (next page)' : '';
    return `${action}${target ? ` ${target}` : ''}${page}`;
  }
  if (
    (name === 'create_code_channel' || name === 'set_code_channel_view') &&
    parsed.data.name
  ) {
    return `${label}: ${shortTarget(parsed.data.name)}`;
  }
  if (name === 'get_user' && parsed.data.userId) {
    return `${label} ${shortTarget(parsed.data.userId)}`;
  }
  if (name === 'get_channel_info' && parsed.data.channelId) {
    return `${label} ${shortTarget(parsed.data.channelId.replace(/^slack:/, ''))}`;
  }
  if (name === 'skill' || name === 'read_skill') {
    const skill = parsed.data.name ?? parsed.data.skillName;
    return skill ? `${label}: ${shortTarget(skill)}` : label;
  }
  if (name === 'skill_read' || name === 'read_skill_file') {
    const skill = parsed.data.skillName ?? parsed.data.name;
    const target = [skill, parsed.data.path].filter(Boolean).join('/');
    return target ? `${label}: ${shortTarget(target)}` : label;
  }
  if (name === 'fetch_url' && parsed.data.url) {
    return `reading ${new URL(parsed.data.url).hostname}`;
  }
  if (!parsed.data.path) {
    return label;
  }
  const target = shortTarget(posix.basename(parsed.data.path));
  if (!target || target === '.' || target === '/') {
    return label;
  }
  switch (name) {
    case 'read_file':
      return `reading ${target}`;
    case 'write_file':
      return `writing ${target}`;
    case 'edit_file':
      return `editing ${target}`;
    case 'delete_file':
    case 'delete':
      return `deleting ${target}`;
    case 'file_stat':
      return `checking ${target}`;
    case 'list_files':
      return `listing files in ${target}`;
    case 'grep':
      return `searching files in ${target}`;
    case 'view_image':
      return `looking at ${target}`;
    case 'upload_file':
      return `uploading ${target}`;
    case 'set_code_channel_view':
      return `${label}: ${target}`;
    default:
      return label;
  }
}
