import { RadioSelect } from 'chat';
import { type ToolPermission, toolPermissionSchema } from '../../../types';
import { PRESETS } from '../presets';

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
