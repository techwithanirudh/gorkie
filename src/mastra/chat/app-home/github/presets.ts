import { RadioSelect } from 'chat';
import { type GitHubPermission, githubPermissionSchema } from '../../../types';

const PRESETS = {
  all: {
    description: 'Even reading waits.',
    label: 'Ask for everything',
    status: '`asks for everything`',
  },
  never: {
    description: 'Nothing waits, including writes.',
    label: 'Never ask',
    status: '`never asks`',
  },
  write: {
    description: 'Reading runs. Writing and deleting wait.',
    label: 'Ask before writing or deleting',
    status: '`asks before writing or deleting`',
  },
} satisfies Record<
  GitHubPermission,
  { description: string; label: string; status: string }
>;

export function presetStatus(permission: GitHubPermission): string {
  return PRESETS[permission].status;
}

export function decodePreset(value: string | undefined): GitHubPermission {
  return githubPermissionSchema.parse(value);
}

export function presetRadio({
  id,
  permission,
}: {
  id: string;
  permission: GitHubPermission;
}) {
  return RadioSelect({
    id,
    label: 'When should Gorkie stop and ask?',
    initialOption: permission,
    options: (['all', 'write', 'never'] as const).map((value) => ({
      label: PRESETS[value].label,
      description: PRESETS[value].description,
      value,
    })),
  });
}
