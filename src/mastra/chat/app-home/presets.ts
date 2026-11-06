import { RadioSelect } from 'chat';
import { z } from 'zod';
import type { ApprovalLevel } from '../../types';

export const presets = {
  all: {
    description: 'Even reading waits.',
    label: 'Ask for everything',
    status: '`asks for everything`',
  },
  write: {
    description: 'Reading runs. Writing and deleting wait.',
    label: 'Ask before writing or deleting',
    status: '`asks before writing or deleting`',
  },
  delete: {
    description: 'Only deleting waits.',
    label: 'Ask only before deleting',
    status: '`asks before deleting`',
  },
  never: {
    description: 'Nothing waits, including writes.',
    label: 'Never ask',
    status: '`never asks`',
  },
} satisfies Record<
  ApprovalLevel,
  { description: string; label: string; status: string }
>;

export const scopeSchema = z.enum(['dm', 'threads']).catch('dm');

type Scope = z.infer<typeof scopeSchema>;

const scopeLabels = {
  dm: 'Only in a DM with you',
  threads: 'Anywhere, including shared threads',
} satisfies Record<Scope, string>;

export function scopeSelect({
  descriptions,
  id,
  label,
  threads,
}: {
  descriptions: Record<Scope, string>;
  id: string;
  label: string;
  threads: boolean;
}) {
  return RadioSelect({
    id,
    label,
    initialOption: threads ? 'threads' : 'dm',
    options: scopeSchema.unwrap().options.map((value) => ({
      label: scopeLabels[value],
      description: descriptions[value],
      value,
    })),
  });
}
