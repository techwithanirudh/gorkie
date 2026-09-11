import { z } from 'zod';
import { asksBefore, type ToolKind, type ToolPermission } from '../../types';

// `${userId}:${server}` for servers that expose tools but annotate none of
// them, which is the only thing the Home tab asks about.
export const unlabelledServers = new Set<string>();

export function approvalFor(permission: ToolPermission) {
  return ({
    annotations,
    toolName,
  }: {
    annotations?: { destructiveHint?: boolean; readOnlyHint?: boolean };
    toolName: string;
  }): boolean => {
    let kind: ToolKind = 'write';
    if (
      annotations?.destructiveHint === true ||
      toolName.startsWith('delete_') ||
      toolName.startsWith('remove_')
    ) {
      kind = 'delete';
    } else if (annotations?.readOnlyHint === true) {
      kind = 'read';
    }
    return asksBefore({ kind, level: permission });
  };
}

export const annotatedTool = z.object({
  mcp: z
    .object({
      annotations: z
        .object({ readOnlyHint: z.boolean().optional() })
        .optional(),
    })
    .optional(),
});
