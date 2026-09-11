import { CardText, Modal, TextInput } from 'chat';
import { annotationCoverage } from '../../../mcp/user-servers';
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
  const coverage = annotationCoverage.get(`${userId}:${server.name}`);
  const unlabelled =
    coverage !== undefined && coverage.total > 0 && coverage.annotated === 0;
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
              `:warning: This server does not say which of its ${coverage.total} tools only read, so Gorkie treats them all as writes. Asking before writing will stop on every call here, and asking only before deleting will let real writes through.`
            ),
          ]
        : []),
    ],
  });
}

export function addServerModal() {
  return Modal({
    callbackId: ids.modal,
    title: 'Add MCP Server',
    submitLabel: 'Add',
    children: [
      TextInput({
        id: 'name',
        label: 'Name',
        placeholder: 'notion',
        maxLength: 60,
      }),
      TextInput({
        id: 'url',
        label: 'Server URL',
        placeholder: 'https://mcp.example.com/mcp',
        maxLength: 500,
      }),
      TextInput({
        id: 'token',
        label: 'Access token',
        optional: true,
        maxLength: 2000,
      }),
    ],
  });
}
