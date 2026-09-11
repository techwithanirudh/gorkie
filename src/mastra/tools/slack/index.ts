import { getChannelInfoTool } from './get-channel-info';
import { getPermalinkTool } from './get-permalink';
import { getSlackFileTool } from './get-slack-file';
import { getUserTool } from './get-user';
import { leaveThreadTool } from './leave-thread';
import { listChannelsTool } from './list-channels';
import { listThreadsTool } from './list-threads';
import { postMessageTool } from './post-message';
import { reactTool } from './react';
import { readConversationHistoryTool } from './read-conversation-history';
import { searchSlackTool } from './search-slack';
import { summarizeThreadTool } from './summarize-thread';
import { uploadFileTool } from './upload-file';

export const slackTools = {
  react: reactTool,
  search_slack: searchSlackTool,
  read_conversation_history: readConversationHistoryTool,
  list_threads: listThreadsTool,
  get_user: getUserTool,
  get_channel_info: getChannelInfoTool,
  get_permalink: getPermalinkTool,
  list_channels: listChannelsTool,
  get_slack_file: getSlackFileTool,
  upload_file: uploadFileTool,
  post_message: postMessageTool,
  leave_thread: leaveThreadTool,
  summarize_thread: summarizeThreadTool,
};
