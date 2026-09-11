import { z } from 'zod';
import { asksBefore, type ToolKind, type ToolPermission } from '../../types';

export const annotationCoverage = new Map<
  string,
  { annotated: number; total: number }
>();

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

const annotatedTool = z.object({
  mcp: z
    .object({
      annotations: z
        .object({ readOnlyHint: z.boolean().optional() })
        .optional(),
    })
    .optional(),
});

export function readOnlyHintOf(tool: unknown): boolean | undefined {
  return annotatedTool.safeParse(tool).data?.mcp?.annotations?.readOnlyHint;
}
