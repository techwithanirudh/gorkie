import { deleteMessageTool } from './delete-message';
import { editMessageTool } from './edit-message';
import { getChannelInfoTool } from './get-channel-info';
import { getFileTool } from './get-file';
import { getUserTool } from './get-user';
import { leaveChannelTool } from './leave-channel';
import { leaveThreadTool } from './leave-thread';
import { listThreadsTool } from './list-threads';
import { postMessageTool } from './post-message';
import { readConversationHistoryTool } from './read-conversation-history';
import { searchSlackTool } from './search-slack';
import { summarizeThreadTool } from './summarize-thread';
import { uploadFileTool } from './upload-file';

export const slackTools = {
  search_slack: searchSlackTool,
  read_conversation_history: readConversationHistoryTool,
  list_threads: listThreadsTool,
  get_user: getUserTool,
  get_channel_info: getChannelInfoTool,
  get_file: getFileTool,
  upload_file: uploadFileTool,
  post_message: postMessageTool,
  edit_message: editMessageTool,
  delete_message: deleteMessageTool,
  leave_thread: leaveThreadTool,
  leave_channel: leaveChannelTool,
  summarize_thread: summarizeThreadTool,
};
