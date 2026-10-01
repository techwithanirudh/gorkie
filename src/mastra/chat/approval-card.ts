import { escapeSlackText } from '@chat-adapter/slack/format';
import type { RequestContext } from '@mastra/core/request-context';
import { computeNextFireAt } from '@mastra/core/workflows';
import {
  Actions,
  Button,
  Card,
  type CardChild,
  type CardElement,
  CardText,
} from 'chat';
import { formatDuration, intervalToDuration } from 'date-fns';
import { z } from 'zod';
import { channelContext } from '../lib/context';
import { parseSlackInput } from '../lib/ids';
import { isScheduledTask } from '../tools/scheduled-tasks/schedules';
import { getMastra } from './mastra-instance';
import { until } from './moderation/cards';
import { label } from './status/label';

// Mastra's built-in approval card shows only the first argument, cut to 35
// characters. These tools start an unattended run with the requester's tools,
// so their card shows the whole prompt and the schedule instead.
const scheduleArgs = z.object({
  task: z.string(),
  cron: z.string(),
  name: z.string().optional(),
  timezone: z.string().optional(),
});
const resumeArgs = z.object({ id: z.string() });
const waitArgs = z.object({ seconds: z.number(), reason: z.string() });

interface Details {
  lines: string[];
  prompt?: string;
}

function schedule({
  cron,
  name,
  prompt,
  timezone,
}: {
  cron: string;
  name?: string;
  prompt: string;
  timezone?: string;
}): Details {
  let next: string;
  try {
    next = until(new Date(computeNextFireAt(cron, { timezone })));
  } catch {
    // An invalid cron or timezone fails the tool after approval too.
    next = 'invalid schedule';
  }
  return {
    lines: [
      ...(name ? [`*Name:* ${escapeSlackText(name)}`] : []),
      `*Schedule:* \`${escapeSlackText(cron)}\` (${timezone ? escapeSlackText(timezone) : 'server time zone'}), next run ${next}`,
      '*Prompt it will run, with your tools:*',
    ],
    prompt,
  };
}

async function resumeDetails({
  args,
  requestContext,
}: {
  args: unknown;
  requestContext?: RequestContext;
}): Promise<Details | undefined> {
  const parsed = resumeArgs.safeParse(args);
  if (!parsed.success) {
    return;
  }
  const row = await getMastra().schedules.get(parsed.data.id);
  const { userId } = channelContext(requestContext);
  if (
    !(row && isScheduledTask(row) && row.resourceId && userId) ||
    parseSlackInput(row.resourceId).channel !== userId
  ) {
    return {
      lines: [
        `Schedule \`${escapeSlackText(parsed.data.id)}\` is not one of your scheduled tasks.`,
      ],
    };
  }
  return schedule({
    cron: row.cron,
    name: row.name,
    prompt: row.prompt,
    timezone: row.timezone,
  });
}

async function details({
  args,
  requestContext,
  toolName,
}: {
  args: unknown;
  requestContext?: RequestContext;
  toolName: string;
}): Promise<Details | undefined> {
  if (toolName === 'create_scheduled_task') {
    const parsed = scheduleArgs.safeParse(args);
    return parsed.success
      ? schedule({ ...parsed.data, prompt: parsed.data.task })
      : undefined;
  }
  if (toolName === 'resume_scheduled_task') {
    return await resumeDetails({ args, requestContext });
  }
  if (toolName === 'wait') {
    const parsed = waitArgs.safeParse(args);
    if (!parsed.success) {
      return;
    }
    const after = formatDuration(
      intervalToDuration({ start: 0, end: parsed.data.seconds * 1000 })
    );
    return {
      lines: [
        `*Wakes this thread:* ${after || `${parsed.data.seconds} seconds`} after you approve`,
        '*What it will do then, with your tools:*',
      ],
      prompt: parsed.data.reason,
    };
  }
}

// Escaping stops a prompt from mentioning, broadcasting or linking. Slack caps
// a section's text at 3000 characters; the split never cuts an entity in half.
function promptBlocks(value: string): CardChild[] {
  return (
    escapeSlackText(value).match(/(?:&(?:amp|lt|gt);|[^&]){1,2900}/gs) ?? []
  ).map((piece) => CardText(`\`\`\`${piece}\`\`\``));
}

export async function approvalCard({
  args,
  requestContext,
  toolCallId,
  toolName,
}: {
  args: unknown;
  requestContext?: RequestContext;
  toolCallId: string;
  toolName: string;
}): Promise<CardElement | undefined> {
  const shown = await details({ args, requestContext, toolName });
  if (!shown) {
    return;
  }
  return Card({
    children: [
      CardText(`*${label(toolName)}*`),
      CardText(shown.lines.join('\n')),
      ...(shown.prompt === undefined ? [] : promptBlocks(shown.prompt)),
      CardText('Requires approval to run.'),
      Actions([
        // Mastra's channel action handler matches these ids.
        Button({
          id: `tool_approve:${toolCallId}`,
          label: 'Approve',
          style: 'primary',
        }),
        Button({
          id: `tool_deny:${toolCallId}`,
          label: 'Deny',
          style: 'danger',
        }),
      ]),
    ],
  });
}
