import type { PlainTextOption } from '@slack/web-api';
import { z } from 'zod';
import { ids } from '../ids';

export type ConnectMethod = 'app' | 'pat';

export const option = ({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: string;
}): PlainTextOption => ({
  text: { type: 'plain_text', text: label },
  description: { type: 'plain_text', text: description },
  value,
});

export const text = (body: string) => ({
  type: 'section' as const,
  text: { type: 'mrkdwn' as const, text: body },
});

const viewAction = z.object({
  view: z.object({
    hash: z.string().optional(),
    id: z.string(),
    state: z
      .object({
        values: z.record(
          z.string(),
          z.record(
            z.string(),
            z.looseObject({
              selected_option: z.object({ value: z.string() }).nullish(),
            })
          )
        ),
      })
      .optional(),
  }),
});

export type ViewTarget = z.infer<typeof viewAction>['view'];

// Slack rejects an update carrying a stale hash, which is what stops a
// concurrent action's render from being clobbered.
export const viewOf = (raw: unknown): ViewTarget | undefined =>
  viewAction.safeParse(raw).data?.view;

export const selectedPermission = ({
  raw,
  renderedScope,
}: {
  raw: unknown;
  renderedScope: 'dm' | 'threads';
}): string | undefined =>
  viewAction.safeParse(raw).data?.view.state?.values?.[
    `${ids.permission}_${renderedScope}`
  ]?.[ids.permission]?.selected_option?.value;
