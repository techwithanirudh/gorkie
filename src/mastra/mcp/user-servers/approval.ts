import type { RequireToolApprovalFn } from '@mastra/mcp';
import { asksBefore } from '../../lib/approval';
import type { ToolKind, ToolPermission } from '../../types';

export function approvalFor(permission: ToolPermission): RequireToolApprovalFn {
  return ({ annotations, toolName }) => {
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
