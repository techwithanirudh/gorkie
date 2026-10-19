import { CardText, Modal, RadioSelect } from 'chat';
import { type GitHubSettings, githubPermissionSchema } from '../../../types';
import { presets, scopeSelect } from '../presets';
import { ids } from './ids';

export function configureModal({ permission, threads }: GitHubSettings) {
  return Modal({
    callbackId: ids.configureModal,
    title: 'Configure GitHub',
    submitLabel: 'Save',
    children: [
      scopeSelect({
        descriptions: {
          dm: 'In a shared thread Gorkie writes up the task and DMs it to you instead.',
          threads:
            'Anyone in the thread can steer it, and checked-out code stays readable.',
        },
        id: ids.scope,
        label: 'Where can Gorkie use GitHub?',
        threads,
      }),
      RadioSelect({
        id: ids.permission,
        label: 'When should Gorkie stop and ask?',
        initialOption: permission,
        options: githubPermissionSchema.options.map((value) => ({
          label: presets[value].label,
          description: presets[value].description,
          value,
        })),
      }),
      CardText(
        'In a shared thread Gorkie always asks at least before writing, so "Never ask" applies to DMs only. Gorkie reaches only the repositories you chose. <https://github.com/settings/installations|Change which ones> on GitHub.'
      ),
    ],
  });
}
