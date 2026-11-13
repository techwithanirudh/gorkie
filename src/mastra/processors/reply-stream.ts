import type { Processor } from '@mastra/core/processors';
import { parsePartialJson } from 'ai';
import { chat } from '../chat/instance';
import { partialReplyCard } from '../chat/reply-card';
import { ReplyDraft, replyDrafts } from '../chat/reply-draft';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { partialReplySchema } from '../types/progress';

const replyArgs = new WeakMap<object, { id: string; text: string }>();

export const replyStream = {
  id: 'reply-stream',
  name: 'Reply Stream',
  description: 'Fills in the Slack answer while the model writes reply.',
  async processOutputStream({ part, requestContext, state }) {
    const { threadId } = channelContext(requestContext);
    if (!threadId) {
      return part;
    }
    if (
      part.type === 'tool-call-input-streaming-start' &&
      part.payload.toolName === 'reply'
    ) {
      replyArgs.set(state, { id: part.payload.toolCallId, text: '' });
      if (!replyDrafts.has(threadId)) {
        replyDrafts.set(threadId, new ReplyDraft(chat().thread(threadId)));
      }
    }
    const args = replyArgs.get(state);
    const draft = replyDrafts.get(threadId);
    if (
      part.type === 'tool-call-delta' &&
      args?.id === part.payload.toolCallId &&
      draft
    ) {
      args.text += part.payload.argsTextDelta;
      const { value } = await parsePartialJson(args.text);
      const { card, message } = partialReplySchema.safeParse(value).data ?? {};
      if (message) {
        draft.writeMessage(message);
      }
      if (
        card &&
        args.text.includes('"message"') &&
        args.text.indexOf('"message"') < args.text.indexOf('"card"')
      ) {
        draft.closeMessage();
        try {
          const partial = partialReplyCard(card);
          if (partial && (partial.title || partial.children.length > 0)) {
            draft.writeCard({ answer: message ?? '', card: partial });
          }
        } catch (error) {
          logger.debug('[reply] skipped a partial card', { error, threadId });
        }
      }
    }
    if (
      (part.type === 'tool-error' && part.payload.toolCallId === args?.id) ||
      ['abort', 'error', 'finish'].includes(part.type)
    ) {
      draft?.closeMessage();
    }
    // processOutputResult only runs after a finish, and a draft left behind would
    // swallow the next turn's reply.
    if (['abort', 'error'].includes(part.type)) {
      replyDrafts.delete(threadId);
    }
    return part;
  },
  processOutputResult({ messages, requestContext }) {
    const { threadId } = channelContext(requestContext);
    if (threadId) {
      replyDrafts.get(threadId)?.closeMessage();
      replyDrafts.delete(threadId);
    }
    return messages;
  },
} satisfies Processor<'reply-stream'>;
