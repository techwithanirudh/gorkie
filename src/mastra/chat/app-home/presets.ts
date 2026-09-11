import type { ApprovalLevel } from '../../types';

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
