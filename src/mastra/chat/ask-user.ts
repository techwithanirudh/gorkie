import { formatSlackUser } from '@chat-adapter/slack/format';
import { RequestContext } from '@mastra/core/request-context';
import type { ActionEvent } from 'chat';
import { Actions, Button, Card, CardText, Chat, Field, Fields } from 'chat';
import { z } from 'zod';
import { agent as agentConfig, slack as slackConfig } from '../config';
import { logger } from '../lib/logger';
import { wakes } from '../prompts/wakes';
import { type ChannelContext, storedJson } from '../types';
import { slack } from './client';
import { getMastra } from './mastra-instance';
import { isBlocked } from './moderation';
import { notify } from './notify';
import { claimTurn } from './usage';

// Mastra's channels routes `tool_approve:` and `tool_deny:`; anything else
// falls through its default action handler untouched.
const askActionId = (index: number) => `gorkie_ask:${index}`;

export const askActionIds = Array.from({ length: 4 }, (_, index) =>
  askActionId(index)
);

const answerSchema = z.object({
  choice: z.string(),
  memory: z.object({ resource: z.string(), thread: z.string() }),
  question: z.string(),
  requester: z.string(),
});

type Answer = z.infer<typeof answerSchema>;

export function askCard({
  memory,
  options,
  question,
  requester,
}: Omit<Answer, 'choice'> & {
  options: { label: string; description?: string }[];
}) {
  const described = options.flatMap(({ label, description }) =>
    description ? [Field({ label, value: description })] : []
  );
  return Card({
    children: [
      CardText(question),
      ...(described.length > 0 ? [Fields(described)] : []),
      Actions(
        options.map(({ label }, index) =>
          Button({
            id: askActionId(index),
            label,
            value: JSON.stringify({
              choice: label,
              memory,
              question,
              requester,
            }),
          })
        )
      ),
      CardText(`for ${formatSlackUser(requester)}`, { style: 'muted' }),
    ],
  });
}

function answeredCard({
  choice,
  question,
  requester,
}: Pick<Answer, 'choice' | 'question' | 'requester'>) {
  return Card({
    children: [
      CardText(question),
      CardText(`*${choice}*, chosen by ${formatSlackUser(requester)}`, {
        style: 'muted',
      }),
    ],
  });
}

function clickChannel(event: ActionEvent): ChannelContext | undefined {
  if (!event.thread) {
    return;
  }
  return {
    botUserId: slack.botUserId,
    channelId: event.thread.channelId,
    eventType: 'action',
    isDM: event.thread.isDM,
    messageId: event.messageId,
    platform: event.adapter.name,
    threadId: event.thread.id,
    userId: event.user.userId,
    userName: event.user.fullName || event.user.userName,
  };
}

async function wakeWithAnswer({
  answer,
  channel,
}: {
  answer: Answer;
  channel: ChannelContext;
}): Promise<void> {
  try {
    const { accepted } = getMastra()
      .getAgentById(agentConfig.id)
      .sendMessage(wakes.askAnswered(answer), {
        threadId: answer.memory.thread,
        resourceId: answer.memory.resource,
        ifIdle: {
          behavior: 'wake',
          streamOptions: {
            requestContext: new RequestContext([['channel', channel]]),
          },
        },
      });
    await accepted;
  } catch (error) {
    logger.error('[ask_user] failed to wake the thread', {
      error,
      threadId: answer.memory.thread,
    });
  }
}

export async function onAskClick(event: ActionEvent): Promise<void> {
  const parsed = storedJson.pipe(answerSchema).safeParse(event.value);
  const channel = clickChannel(event);
  if (!(parsed.success && channel)) {
    logger.warn('[ask_user] click carried no answer or thread', {
      actionId: event.actionId,
      messageId: event.messageId,
      userId: event.user.userId,
    });
    return;
  }
  const answer = parsed.data;
  // Banned users already got a notice from the channels onAction handler.
  if (await isBlocked(event.user.userId)) {
    return;
  }
  if (event.user.userId !== answer.requester) {
    await notify({
      text: `only ${formatSlackUser(answer.requester)} can answer this one.`,
      thread: event.thread,
      user: event.user,
    });
    return;
  }

  const state = Chat.getSingleton().getState();
  const answeredKey = `ask-answered:${event.messageId}`;
  if (
    !(await state.setIfNotExists(
      answeredKey,
      true,
      slackConfig.askAnswerLockMs
    ))
  ) {
    return;
  }
  const claim = await claimTurn(answer.requester);
  if (claim.status === 'over-limit') {
    await state.delete(answeredKey);
    await notify({
      text: claim.notice,
      thread: event.thread,
      user: event.user,
    });
    return;
  }

  await slack
    .editMessage(event.threadId, event.messageId, answeredCard(answer))
    .catch((error: unknown) =>
      logger.warn('[ask_user] could not mark the question answered', {
        error,
        messageId: event.messageId,
      })
    );
  logger.info('[ask_user] answered', {
    choice: answer.choice,
    threadId: answer.memory.thread,
    userId: answer.requester,
  });
  await wakeWithAnswer({ answer, channel });
}
