import type { ToolDisplayFn } from '@mastra/core/channels';
import type { Adapter, PlanModel, PlanModelTask, Thread } from 'chat';
import { z } from 'zod';
import { backgroundTasks, activity as config } from '../config';
import { logger } from '../lib/logger';
import {
  type ActivityOutcome,
  activityEndSchema,
  activityPlanSchema,
  activityTaskSchema,
} from '../types/progress';
import { getMastra } from './mastra-instance';
import { addAction, toolActivity } from './status/tool-activity';

interface Step extends PlanModelTask {
  completedAt?: number;
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

const delegatedStepPrefix = 'subagent-';

const taskChunkSchema = z.looseObject({
  type: z.string(),
  payload: z
    .looseObject({
      payload: z
        .looseObject({
          output: z
            .looseObject({
              type: z.string(),
              payload: z
                .looseObject({ args: z.unknown(), toolName: z.string() })
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

type TaskEnd = 'completed' | 'failed' | 'cancelled';

const isTaskEnd = (status: string): status is TaskEnd =>
  ['completed', 'failed', 'cancelled'].includes(status);

// Status is read directly too, because the stream can miss a cancel.
async function followTask({
  onChange,
  step,
}: {
  onChange: () => void;
  step: Step;
}): Promise<TaskEnd> {
  const manager = getMastra().backgroundTaskManager;
  const toolCallId = step.id.slice(delegatedStepPrefix.length);
  const { tasks } = (await manager?.listTasks({ toolCallId })) ?? { tasks: [] };
  const [task] = tasks;
  if (!(manager && task)) {
    step.status = 'complete';
    return 'completed';
  }
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(backgroundTasks.untilIdleMaxIdleMs),
  ]);
  const watchActions = async () => {
    for await (const value of manager.stream({
      abortSignal: signal,
      includeExisting: true,
      taskId: task.id,
    })) {
      const nested =
        taskChunkSchema.safeParse(value).data?.payload?.payload?.output;
      if (nested?.type === 'tool-call' && nested.payload) {
        const action = await toolActivity({
          toolName: nested.payload.toolName,
          args: nested.payload.args,
        });
        if (action) {
          const details = typeof step.details === 'string' ? step.details : '';
          step.details = addAction({
            actions: details.split('\n').filter(Boolean),
            label: action,
          }).join('\n');
          onChange();
        }
      }
    }
  };
  watchActions().catch((error: unknown) => {
    logger.debug('[activity] task stream ended', { error, taskId: task.id });
  });
  let status: string = task.status;
  while (!(isTaskEnd(status) || signal.aborted)) {
    // biome-ignore lint/performance/noAwaitInLoops: this polls until the task ends
    await new Promise((resolve) => {
      setTimeout(resolve, config.taskPollMs);
    });
    status = (await manager.getTask(task.id))?.status ?? 'failed';
  }
  controller.abort();
  const end: TaskEnd = isTaskEnd(status) ? status : 'failed';
  step.status = end === 'failed' ? 'error' : 'complete';
  step.completedAt = Date.now();
  onChange();
  return end;
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
  let messageId: string | undefined;
  let lastSent = '';
  let lastSentAt = 0;
  let updateTimer: ReturnType<typeof setTimeout> | undefined;
  let writes = Promise.resolve();
  const hasDetails = () =>
    [...steps.values()].some(
      (step) => step.id.startsWith(delegatedStepPrefix) || Boolean(step.details)
    );

  // Durations show only once something ends. A running count would need an edit
  // every few seconds per plan, and Slack refuses the bot past about 50 a minute.
  const withTime = (text: string, from: number, to: number | undefined) =>
    to === undefined
      ? sentenceCase(text)
      : `${sentenceCase(text)} · ${elapsed(to - from)}`;
  const render = async () => {
    const model: PlanModel & { gorkieActivity: true } = {
      title: withTime(title, startedAt, completedAt),
      tasks: [...steps.values()].map((step) => {
        const details = typeof step.details === 'string' ? step.details : '';
        const lines = details
          ? details
              .split('\n')
              .filter((line) => line !== step.title)
              .map(sentenceCase)
              .reverse()
          : [];
        return {
          id: step.id,
          title: withTime(step.title, step.startedAt, step.completedAt),
          status: step.status,
          details:
            lines.length === 0 && step.status === 'complete' ? ['Done'] : lines,
        };
      }),
      gorkieActivity: true,
    };
    const signature = JSON.stringify(model);
    if (signature === lastSent) {
      return;
    }
    if (messageId) {
      await adapter.editObject?.(thread.id, messageId, 'plan', model);
    } else if (hasDetails()) {
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
    if (updateTimer) {
      return;
    }
    updateTimer = setTimeout(
      () => {
        updateTimer = undefined;
        enqueue();
      },
      Math.max(0, lastSentAt + config.editIntervalMs - Date.now())
    );
  };
  // Runs detached, because the turn that handed off has to end for the thread to
  // take other messages. The child's result arrives in a later turn.
  const followDelegations = () => {
    const delegated = [...steps.values()].filter(({ id }) =>
      id.startsWith(delegatedStepPrefix)
    );
    title = 'Working';
    completedAt = undefined;
    for (const step of delegated) {
      step.status = 'in_progress';
      step.completedAt = undefined;
    }
    enqueue();
    Promise.all(
      delegated.map((step) => followTask({ step, onChange: schedule }))
    )
      .then((ends) => {
        if (ends.includes('failed')) {
          title = 'Failed';
        } else {
          title = ends.includes('cancelled') ? 'Stopped' : 'Subagents finished';
        }
      })
      .catch((error: unknown) => {
        title = 'Failed';
        logger.warn('[activity] lost track of a background task', {
          error,
          threadId: thread.id,
        });
      })
      .finally(() => {
        clearTimeout(updateTimer);
        updateTimer = undefined;
        completedAt = Date.now();
        return enqueue();
      });
  };
  try {
    for await (const piece of stream) {
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
    clearTimeout(updateTimer);
    updateTimer = undefined;
    completedAt ??= Date.now();
    title = outcome ?? 'Stopped';
    const endStatus: Record<string, PlanModelTask['status']> = {
      Stopped: 'pending',
      Failed: 'error',
    };
    const unfinished = endStatus[title] ?? 'complete';
    for (const step of steps.values()) {
      if (step.status !== 'complete' && step.status !== 'error') {
        step.status = unfinished;
      }
      step.completedAt ??= completedAt;
    }
    if (title === 'Handed off') {
      followDelegations();
    } else {
      await enqueue();
    }
    if (messageId && !hasDetails()) {
      await adapter
        .deleteMessage(thread.id, messageId)
        .catch((error: unknown) => {
          logger.warn('[activity] could not delete an empty plan', {
            error,
            threadId: thread.id,
          });
        });
    }
  }
}

export const toolDisplay = Object.assign(
  (() => undefined) satisfies ToolDisplayFn,
  { activity: showActivity }
);
