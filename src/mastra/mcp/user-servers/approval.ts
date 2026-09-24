import type { RequireToolApprovalFn } from '@mastra/mcp';
import { asksBefore, levelOutsideDM } from '../../lib/approval';
import { channelSchema } from '../../lib/context';
import type { ToolKind, ToolPermission } from '../../types';

export function approvalFor(permission: ToolPermission): RequireToolApprovalFn {
  return ({ annotations, requestContext, toolName }) => {
    const isDM =
      channelSchema.safeParse(requestContext?.channel).data?.isDM === true;
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
    return asksBefore({
      kind,
      level: levelOutsideDM({ isDM, level: permission }),
    });
  };
}
