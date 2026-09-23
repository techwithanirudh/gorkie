import type { PlainTextOption } from '@slack/web-api';
import { type ViewTarget, viewActionSchema } from '../../../../types';
import { ids } from '../ids';

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

export const viewOf = (raw: unknown): ViewTarget | undefined =>
  viewActionSchema.safeParse(raw).data?.view;

export const selectedPermission = ({
  raw,
  renderedScope,
}: {
  raw: unknown;
  renderedScope: 'dm' | 'threads';
}): string | undefined =>
  viewActionSchema.safeParse(raw).data?.view.state?.values?.[
    `${ids.permission}_${renderedScope}`
  ]?.[ids.permission]?.selected_option?.value;
