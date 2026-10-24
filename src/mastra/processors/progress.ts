import type { Processor } from '@mastra/core/processors';
import { toolActivity } from '../chat/status/tool-activity';
import { activity as config } from '../config';
import { channelContext } from '../lib/context';
import { statusUpdateInputSchema } from '../types';
import {
  type ActivityOutcome,
  type ActivityTask,
  activitySchema,
  delegationActivitySchema,
  replyInputSchema,
} from '../types/progress';
import { waitInputSchema } from '../types/tools/wait';

interface Phase {
  actions: string[];
  automatic: boolean;
  current: boolean;
  error: boolean;
  id: string;
  startedAt: number;
  title: string;
}

interface Turn {
  calls: Map<string, Phase>;
  delegationParents: Map<string, Phase>;
  delegations: Map<string, Phase>;
  outcome?: ActivityOutcome;
  phases: Phase[];
  replied: boolean;
  startedAt: number;
}

const turns = new WeakMap<object, Turn>();

function task({ phase, calls }: { phase: Phase; calls: Turn['calls'] }) {
  let status: ActivityTask['status'] = 'complete';
  if (phase.error) {
    status = 'error';
  } else if (phase.current || [...calls.values()].includes(phase)) {
    status = 'in_progress';
  }
  return {
    type: 'task_update',
    id: phase.id,
    title: phase.title.slice(0, config.maxTitleChars),
    status,
    details: phase.actions.join('\n'),
    startedAt: phase.startedAt,
    current: phase.current,
  } satisfies ActivityTask;
}

export const progress = {
  id: 'progress',
  name: 'Progress',
  description:
    'Groups tool activity into temporary work steps in the reply stream.',
  processDataParts: true,
  processOutputStream({ part, requestContext, state }) {
    if (!channelContext(requestContext).threadId) {
      return Promise.resolve(part);
    }
    if (part.type === 'text-delta') {
      return Promise.resolve(null);
    }
    const turn: Turn = turns.get(state) ?? {
      phases: [],
      calls: new Map(),
      delegations: new Map(),
      delegationParents: new Map(),
      replied: false,
      startedAt: Date.now(),
    };
    turns.set(state, turn);
    const chunks: ReturnType<typeof task>[] = [];
    const current = (): Phase | undefined => turn.phases.at(-1);
    const advance = ({
      title,
      automatic,
    }: {
      title: string;
      automatic: boolean;
    }) => {
      const previous = current();
      if (previous?.title === title) {
        return previous;
      }
      if (previous?.automatic && !automatic && !turn.replied) {
        previous.title = title;
        previous.automatic = false;
        chunks.push(task({ phase: previous, calls: turn.calls }));
        return previous;
      }
      if (previous) {
        previous.current = false;
        chunks.push(task({ phase: previous, calls: turn.calls }));
      }
      if (turn.phases.length >= config.maxPhases && previous) {
        previous.title = title;
        previous.automatic = automatic;
        previous.current = true;
        previous.actions = [];
        previous.startedAt = Date.now();
        chunks.push(task({ phase: previous, calls: turn.calls }));
        return previous;
      }
      const phase: Phase = {
        id: `phase-${turn.phases.length + 1}`,
        title,
        automatic,
        current: true,
        error: false,
        actions: [],
        startedAt: Date.now(),
      };
      turn.phases.push(phase);
      chunks.push(task({ phase, calls: turn.calls }));
      return phase;
    };
    const delegation = delegationActivitySchema.safeParse(
      part.metadata?.gorkieDelegation
    ).data;
    const delegatedPhase = delegation
      ? turn.delegations.get(delegation.toolCallId)
      : undefined;
    if (part.type === 'tool-call') {
      const { toolName, toolCallId } = part.payload;
      if (/^agent-(research|explore)$/.test(toolName)) {
        if (!turn.delegations.has(toolCallId)) {
          const phase: Phase = {
            id: `subagent-${toolCallId}`,
            title: `${toolName.slice('agent-'.length)}: working`,
            automatic: false,
            current: true,
            error: false,
            actions: [],
            startedAt: Date.now(),
          };
          turn.delegations.set(toolCallId, phase);
          const parent =
            current() ?? advance({ title: 'delegating work', automatic: true });
          parent.actions.push(
            `started ${toolName.slice('agent-'.length)} agent`
          );
          parent.actions = parent.actions.slice(-config.maxTools);
          turn.delegationParents.set(toolCallId, parent);
          turn.calls.set(toolCallId, phase);
          chunks.push(task({ phase: parent, calls: turn.calls }));
          chunks.push(task({ phase, calls: turn.calls }));
        }
      } else if (toolName === 'wait' && !delegation) {
        const waiting = waitInputSchema.safeParse(part.payload.args);
        if (waiting.success) {
          const label = `waiting ${waiting.data.seconds}s: ${waiting.data.reason}`;
          const phase = current() ?? advance({ title: label, automatic: true });
          phase.actions.push(label);
          phase.actions = phase.actions.slice(-config.maxTools);
          turn.calls.set(toolCallId, phase);
          chunks.push(task({ phase, calls: turn.calls }));
        }
      } else if (toolName === 'status_update') {
        const parsed = statusUpdateInputSchema.safeParse(part.payload.args);
        if (parsed.success) {
          advance({ title: parsed.data.status, automatic: false });
        }
      } else {
        const label = toolActivity({ toolName, args: part.payload.args });
        if (label === null) {
          return Promise.resolve(part);
        }
        const phase =
          delegatedPhase ??
          current() ??
          advance({ title: label, automatic: true });
        if (delegatedPhase && delegation) {
          phase.title = `${delegation.toolName.replace(/^agent-/, '')}: ${label}`;
        }
        if (!turn.calls.has(toolCallId)) {
          turn.calls.set(toolCallId, phase);
          phase.actions.push(label);
          phase.actions = phase.actions.slice(-config.maxTools);
          chunks.push(task({ phase, calls: turn.calls }));
        }
      }
    }
    if (part.type === 'data-code-mode-activity') {
      const parsed = activitySchema.safeParse(part.data);
      if (parsed.success) {
        const label = parsed.data.status;
        const phase =
          delegatedPhase ??
          current() ??
          advance({ title: label, automatic: true });
        if (delegatedPhase && delegation) {
          phase.title = `${delegation.toolName.replace(/^agent-/, '')}: ${label}`;
        }
        phase.actions.push(label);
        phase.actions = phase.actions.slice(-config.maxTools);
        chunks.push(task({ phase, calls: turn.calls }));
      }
    }
    if (part.type === 'tool-result' || part.type === 'tool-error') {
      if (!delegation) {
        if (part.payload.toolName === 'wait') {
          turn.outcome = 'Waiting';
          if (part.type === 'tool-error' || part.payload.isError) {
            turn.outcome = 'Failed';
          }
        } else if (
          part.type === 'tool-result' &&
          !part.payload.isError &&
          part.payload.toolName === 'skip'
        ) {
          turn.outcome = 'Stopped';
        }
      }
      const phase = turn.calls.get(part.payload.toolCallId);
      if (phase) {
        turn.calls.delete(part.payload.toolCallId);
        if (part.payload.toolName === 'wait' && !delegation) {
          phase.current = false;
          phase.error = turn.outcome === 'Failed';
        }
        if (turn.delegations.get(part.payload.toolCallId) === phase) {
          phase.current = false;
          phase.error =
            part.type === 'tool-error' || part.payload.isError === true;
          for (const [id, owner] of turn.calls) {
            if (owner === phase) {
              turn.calls.delete(id);
            }
          }
          const parent = turn.delegationParents.get(part.payload.toolCallId);
          if (parent) {
            const agent = part.payload.toolName.replace(/^agent-/, '');
            const elapsed = Math.max(
              0,
              Math.floor((Date.now() - phase.startedAt) / 1000)
            );
            parent.actions.push(
              `${agent} agent ${phase.error ? 'failed' : 'completed'} in ${elapsed}s`
            );
            parent.actions = parent.actions.slice(-config.maxTools);
            chunks.push(task({ phase: parent, calls: turn.calls }));
          }
        }
        chunks.push(task({ phase, calls: turn.calls }));
      }
    }
    if (part.type === 'tool-call-approval') {
      advance({ title: 'waiting for your approval', automatic: false });
    }
    if (part.type === 'data-reply') {
      const parsed = replyInputSchema.safeParse(part.data);
      if (!parsed.success || turn.replied) {
        return Promise.resolve(null);
      }
      turn.replied = true;
      turn.outcome = 'Completed';
      turn.calls.clear();
      for (const phase of [...turn.phases, ...turn.delegations.values()]) {
        phase.current = false;
        chunks.push(task({ phase, calls: turn.calls }));
      }
      part = {
        ...part,
        type: 'text-delta',
        payload: { id: 'reply', text: parsed.data.message },
      };
    }
    if (['finish', 'error', 'abort'].includes(part.type)) {
      turns.delete(state);
    }
    return Promise.resolve({
      ...part,
      metadata: {
        ...part.metadata,
        gorkieActivity: {
          chunks,
          replied: turn.replied,
          outcome: turn.outcome,
          startedAt: turn.startedAt,
          status: current()?.title || 'working',
          intervalMs: config.updateIntervalMs,
        },
      },
    });
  },
  processOutputResult({ messages, state }) {
    turns.delete(state);
    return Promise.resolve(messages);
  },
} satisfies Processor<'progress'>;
