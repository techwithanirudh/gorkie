import { getChannelInfoTool } from './get-channel-info';
import { getFileTool } from './get-file';
import { getUserTool } from './get-user';
import { leaveThreadTool } from './leave-thread';
import { listThreadsTool } from './list-threads';
import { mermaidTool } from './mermaid';
import { postMessageTool } from './post-message';
import { readConversationHistoryTool } from './read-conversation-history';
import { scheduleReminderTool } from './schedule-reminder';
import { searchSlackTool } from './search-slack';
import { searchWebTool } from './search-web';
import { skipTool } from './skip';
import { summarizeThreadTool } from './summarize-thread';
import { uploadFileTool } from './upload-file';

export const tools = {
  skip: skipTool,
  search_web: searchWebTool,
  search_slack: searchSlackTool,
  read_conversation_history: readConversationHistoryTool,
  list_threads: listThreadsTool,
  get_user: getUserTool,
  get_channel_info: getChannelInfoTool,
  get_file: getFileTool,
  upload_file: uploadFileTool,
  mermaid: mermaidTool,
  post_message: postMessageTool,
  schedule_reminder: scheduleReminderTool,
  leave_thread: leaveThreadTool,
  summarize_thread: summarizeThreadTool,
};
