import { RadioSelect } from 'chat';
import type { ToolPermission } from '../../../types';
import { PRESETS } from '../presets';

export function presetRadio({
  id,
  permission,
}: {
  id: string;
  permission: ToolPermission;
}) {
  return RadioSelect({
    id,
    label: 'When should Gorkie stop and ask?',
    initialOption: permission,
    options: (['all', 'write', 'delete'] as const).map((value) => ({
      label: PRESETS[value].label,
      description: PRESETS[value].description,
      value,
    })),
  });
}
