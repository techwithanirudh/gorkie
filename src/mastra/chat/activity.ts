import { Readable } from 'node:stream';
import type { ToolDisplayFn } from '@mastra/core/channels';
import type { Adapter, PlanModel, PlanModelTask, Thread } from 'chat';
import { activity as config } from '../config';
import { logger } from '../lib/logger';
import {
  type ActivityOutcome,
  activityEndSchema,
  activityPlanSchema,
  activityTaskSchema,
} from '../types/progress';

interface Step extends PlanModelTask {
  completedAt?: number;
  current: boolean;
  startedAt: number;
}

function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function showActivity({
  adapter,
  stream,
  thread,
}: {
  adapter: Adapter;
  stream: AsyncIterable<unknown>;
  thread: Thread;
}): Promise<void> {
  if (!(adapter.postObject && adapter.editObject)) {
    throw new Error('Activity display requires editable Plan support.');
  }
  const steps = new Map<string, Step>();
  let title = 'Working';
  let startedAt = Date.now();
  let completedAt: number | undefined;
  let outcome: ActivityOutcome | undefined;
  let answer = '';
  let messageId: string | undefined;
  let lastSent = '';
  let lastSentAt = 0;
  let closed = false;
  let updateTimer: ReturnType<typeof setTimeout> | undefined;
  let writes = Promise.resolve();

  const render = async () => {
    const now = Date.now();
    const model: PlanModel & { gorkieActivity: { answer: string } } = {
      title: `${sentenceCase(title)} · ${elapsed((completedAt ?? now) - startedAt)}`,
      tasks: [...steps.values()].map((step) => {
        const details = typeof step.details === 'string' ? step.details : '';
        const lines = details ? details.split('\n').map(sentenceCase) : [];
        return {
          id: step.id,
          title: `${sentenceCase(step.title)} · ${elapsed((step.completedAt ?? now) - step.startedAt)}`,
          status: step.status,
          details: lines,
        };
      }),
      gorkieActivity: { answer: '' },
    };
    const signature = JSON.stringify(model);
    if (signature === lastSent) {
      return;
    }
    if (messageId) {
      await adapter.editObject?.(thread.id, messageId, 'plan', model);
    } else if (
      [...steps.values()].some(
        (step) => step.id.startsWith('subagent-') || Boolean(step.details)
      )
    ) {
      const posted = await adapter.postObject?.(thread.id, 'plan', model);
      messageId = posted?.id;
    }
    lastSent = signature;
    lastSentAt = Date.now();
  };
  const enqueue = () => {
    writes = writes.then(render).catch((error: unknown) => {
      logger.warn('[activity] plan update failed', {
        error,
        threadId: thread.id,
      });
    });
    return writes;
  };
  const schedule = () => {
    if (closed || updateTimer) {
      return;
    }
    const delay = Math.max(
      0,
      lastSentAt + config.updateIntervalMs - Date.now()
    );
    updateTimer = setTimeout(() => {
      updateTimer = undefined;
      // A Slack edit must not hold the model stream behind a network request.
      enqueue();
    }, delay);
  };
  const ticker = setInterval(schedule, config.elapsedIntervalMs);
  ticker.unref();
  try {
    for await (const piece of stream) {
      if (typeof piece === 'string') {
        answer += piece;
        schedule();
        continue;
      }
      const ended = activityEndSchema.safeParse(piece);
      if (ended.success) {
        ({ outcome } = ended.data);
        continue;
      }
      const plan = activityPlanSchema.safeParse(piece);
      if (plan.success) {
        ({ title } = plan.data);
        startedAt = plan.data.startedAt ?? startedAt;
        if (title === 'Completed') {
          completedAt ??= Date.now();
        }
        schedule();
        continue;
      }
      const parsed = activityTaskSchema.safeParse(piece);
      if (!parsed.success) {
        continue;
      }
      const task = parsed.data;
      const previous = steps.get(task.id);
      const now = Date.now();
      steps.set(task.id, {
        id: task.id,
        title: task.title,
        status: task.status,
        details: task.details ?? previous?.details ?? '',
        startedAt: task.startedAt ?? previous?.startedAt ?? now,
        current: task.current ?? previous?.current ?? true,
        completedAt:
          task.status === 'complete' || task.status === 'error'
            ? (previous?.completedAt ?? now)
            : undefined,
      });
      schedule();
    }
  } catch (error) {
    outcome = 'Failed';
    throw error;
  } finally {
    closed = true;
    clearInterval(ticker);
    clearTimeout(updateTimer);
    completedAt ??= Date.now();
    title = outcome ?? (answer.trim() ? 'Completed' : 'Stopped');
    for (const step of steps.values()) {
      if (step.status !== 'complete' && step.status !== 'error') {
        step.status = 'complete';
        if (title === 'Stopped') {
          step.status = 'pending';
        } else if (title === 'Failed') {
          step.status = 'error';
        }
      }
      step.completedAt ??= completedAt;
    }
    await enqueue();
    if (!answer.trim()) {
      if (
        messageId &&
        ![...steps.values()].some(
          (step) => Boolean(step.details) || step.id.startsWith('subagent-')
        )
      ) {
        await adapter.deleteMessage(thread.id, messageId);
      }
    } else if (answer.length <= config.maxAnswerPreviewChars) {
      await thread.post({ markdown: answer });
    } else {
      function* text() {
        for (
          let offset = 0;
          offset < answer.length;
          offset += config.answerChunkChars
        ) {
          yield answer.slice(offset, offset + config.answerChunkChars);
        }
      }
      await thread.post(Readable.from(text()));
    }
  }
}

export const toolDisplay = Object.assign(
  (() => undefined) satisfies ToolDisplayFn,
  { activity: showActivity }
);
