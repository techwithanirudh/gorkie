import { CardText, Modal, RadioSelect } from 'chat';
import { knownUnlabelled } from '../../../mcp/user-servers/client';
import { type MCPServerConfig, toolPermissionSchema } from '../../../types';
import { presets, scopeSelect } from '../presets';
import { ids } from './ids';

export function serverScopeSelect(threads: boolean) {
  return scopeSelect({
    descriptions: {
      dm: "Shared threads get none of this server's tools.",
      threads:
        'Anyone in the thread can steer it, and it always asks at least before writing there.',
    },
    id: ids.scope,
    label: 'Where can Gorkie use this server?',
    threads,
  });
}

export function configureModal({
  server,
  userId,
}: {
  server: MCPServerConfig;
  userId: string;
}) {
  const unlabelled = knownUnlabelled({ serverName: server.name, userId });
  return Modal({
    callbackId: ids.configureModal,
    title: `Configure ${server.name}`.slice(0, 24),
    submitLabel: 'Save',
    privateMetadata: server.name,
    children: [
      serverScopeSelect(server.threads),
      RadioSelect({
        id: 'permission',
        label: 'When should Gorkie stop and ask?',
        initialOption: server.permission,
        options: toolPermissionSchema.options.map((value) => ({
          label: presets[value].label,
          description: presets[value].description,
          value,
        })),
      }),
      ...(unlabelled
        ? [
            CardText(
              ':warning: This server does not say which of its tools only read, so Gorkie treats them all as writes. Asking before writing will stop on every call here, and asking only before deleting will let real writes through.'
            ),
          ]
        : []),
    ],
  });
}
