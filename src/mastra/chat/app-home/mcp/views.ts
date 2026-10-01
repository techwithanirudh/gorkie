import { CardText, Modal, RadioSelect } from 'chat';
import {
  coverageKey,
  unlabelledServers,
} from '../../../mcp/user-servers/tools';
import { type MCPServerConfig, toolPermissionSchema } from '../../../types';
import { PRESETS, SCOPE_LABELS, scopeSchema } from '../presets';
import { ids } from './ids';

// TODO(slopradar): duplication : same scope RadioSelect as github/views.ts:12 with different copy, and `id: 'scope'` is a literal while github uses ids.scope → one `scopeSelect({ id, threads, descriptions })` in presets.ts
export function scopeSelect(threads: boolean) {
  return RadioSelect({
    id: 'scope',
    label: 'Where can Gorkie use this server?',
    initialOption: threads ? 'threads' : 'dm',
    options: scopeSchema.unwrap().options.map((value) => ({
      label: SCOPE_LABELS[value],
      description: {
        dm: "Shared threads get none of this server's tools.",
        threads:
          'Anyone in the thread can steer it, and it always asks at least before writing there.',
      }[value],
      value,
    })),
  });
}

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
      scopeSelect(server.threads),
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
