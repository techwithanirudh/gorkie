import { RadioSelect } from 'chat';
import { type ToolPermission, toolPermissionSchema } from '../../../types';

const PRESETS = {
  all: {
    description: 'Even reading waits.',
    label: 'Ask for everything',
    status: '`asks for everything`',
  },
  delete: {
    description: 'Only deleting waits.',
    label: 'Ask only before deleting',
    status: '`asks before deleting`',
  },
  write: {
    description: 'Reading runs. Writing and deleting wait.',
    label: 'Ask before writing or deleting',
    status: '`asks before writing or deleting`',
  },
} satisfies Record<
  ToolPermission,
  { description: string; label: string; status: string }
>;

export function presetStatus(permission: ToolPermission): string {
  return PRESETS[permission].status;
}

export function decodePreset(value: string | undefined): {
  permission: ToolPermission;
  scope: string | undefined;
} {
  const [head, tail] = (value ?? '').split(' ');
  return tail === undefined
    ? { permission: toolPermissionSchema.parse(head), scope: undefined }
    : { permission: toolPermissionSchema.parse(tail), scope: head };
}

export function presetRadio({
  id,
  permission,
  scope,
}: {
  id: string;
  permission: ToolPermission;
  scope: string;
}) {
  return RadioSelect({
    id,
    label: 'When should Gorkie stop and ask?',
    initialOption: `${scope} ${permission}`,
    options: (['all', 'write', 'delete'] as const).map((value) => ({
      label: PRESETS[value].label,
      description: PRESETS[value].description,
      value: `${scope} ${value}`,
    })),
  });
}
