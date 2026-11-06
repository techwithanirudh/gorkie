export const turnContext = {
  attachments: 'Slack attachments:',
  attachmentInlined: 'attached to this message, so you can already see it',
  attachmentNotDownloaded: 'not downloaded',
  getSlackFile:
    'Call get_slack_file with a Slack file id to download a file into the workspace, which you only need for an attached file if you want to work on it there.',
  unseen:
    '[Recent messages in this thread, oldest first, that you have not seen yet]',
  unseenTruncated:
    '[Older unseen messages were left out. Read them with read_conversation_history if they matter.]',
  comments: (count: number) =>
    `[${count} ${count === 1 ? 'message' : 'messages'} starting with ## were left out. They are side comments nobody addressed to you, so act on them only if asked. Read them with read_conversation_history and includeComments if you need them.]`,
};
