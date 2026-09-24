import { CardText, Modal, RadioSelect } from 'chat';
import { type GitHubSettings, githubPermissionSchema } from '../../../types';
import { PRESETS } from '../presets';
import { ids } from './ids';

export function configureModal({ permission, threads }: GitHubSettings) {
  return Modal({
    callbackId: ids.configureModal,
    title: 'Configure GitHub',
    submitLabel: 'Save',
    children: [
      RadioSelect({
        id: ids.scope,
        label: 'Where can Gorkie use GitHub?',
        initialOption: threads ? 'threads' : 'dm',
        options: [
          {
            label: 'Only in a DM with you',
            description:
              'In a shared thread Gorkie writes up the task and DMs it to you instead.',
            value: 'dm',
          },
          {
            label: 'Anywhere, including shared threads (dangerous)',
            description:
              'Anyone in the thread can steer it, and checked-out code stays readable.',
            value: 'threads',
          },
        ],
      }),
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
        'In a shared thread Gorkie always asks at least before writing, so "Never ask" applies to DMs only. Gorkie reaches only the repositories you chose. <https://github.com/settings/installations|Change which ones> on GitHub.'
      ),
    ],
  });
}
