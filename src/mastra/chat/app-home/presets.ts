import { z } from 'zod';
import type { ApprovalLevel } from '../../types';

// TODO(slopradar): naming : SCREAMING_CASE (PRESETS, SCOPE_LABELS, moderation/index.ts DURATION) while every other module constant is camelCase → `presets`, `scopeLabels`, `banDurations`
export const PRESETS = {
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

export const SCOPE_LABELS = {
  dm: 'Only in a DM with you',
  threads: 'Anywhere, including shared threads',
} satisfies Record<z.infer<typeof scopeSchema>, string>;
