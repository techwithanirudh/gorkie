import { CardText, Modal } from 'chat';
import { unlabelledServers } from '../../../mcp/user-servers';
import type { MCPServerConfig } from '../../../types';
import { ids } from './ids';
import { presetRadio } from './presets';

export function configureModal({
  server,
  userId,
}: {
  server: MCPServerConfig;
  userId: string;
}) {
  const unlabelled = unlabelledServers.has(`${userId}:${server.name}`);
  return Modal({
    callbackId: ids.configureModal,
    title: `Configure ${server.name}`.slice(0, 24),
    submitLabel: 'Save',
    children: [
      presetRadio({
        id: 'permission',
        permission: server.permission,
        scope: server.name,
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
