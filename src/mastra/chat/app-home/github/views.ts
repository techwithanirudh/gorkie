import { CardText, Modal, RadioSelect } from 'chat';
import { type GitHubPermission, githubPermissionSchema } from '../../../types';
import { PRESETS } from '../presets';
import { ids } from './ids';

export function configureModal(permission: GitHubPermission) {
  return Modal({
    callbackId: ids.configureModal,
    title: 'Configure GitHub',
    submitLabel: 'Save',
    children: [
      RadioSelect({
        id: ids.permission,
        label: 'When should Gorkie stop and ask?',
        initialOption: permission,
        options: githubPermissionSchema.unwrap().options.map((value) => ({
          label: PRESETS[value].label,
          description: PRESETS[value].description,
          value,
        })),
      }),
      CardText(
        'GitHub runs only in a DM with you. In a shared thread Gorkie writes up the task and DMs it to you instead. Gorkie reaches only the repositories you chose. <https://github.com/settings/installations|Change which ones> on GitHub.'
      ),
    ],
  });
}
