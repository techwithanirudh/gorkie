import { CardText, Modal, RadioSelect } from 'chat';
import {
  coverageKey,
  unlabelledServers,
} from '../../../mcp/user-servers/approval';
import { type MCPServerConfig, toolPermissionSchema } from '../../../types';
import { PRESETS } from '../presets';
import { ids } from './ids';

export function configureModal({
  server,
  userId,
}: {
  server: MCPServerConfig;
  userId: string;
}) {
  const unlabelled = unlabelledServers.has(
    coverageKey({ serverName: server.name, userId })
  );
  return Modal({
    callbackId: ids.configureModal,
    title: `Configure ${server.name}`.slice(0, 24),
    submitLabel: 'Save',
    privateMetadata: server.name,
    children: [
      RadioSelect({
        id: 'permission',
        label: 'When should Gorkie stop and ask?',
        initialOption: server.permission,
        options: toolPermissionSchema.unwrap().options.map((value) => ({
          label: PRESETS[value].label,
          description: PRESETS[value].description,
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
