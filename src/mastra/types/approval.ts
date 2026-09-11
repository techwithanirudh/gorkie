const APPROVAL_LEVELS = ['all', 'write', 'delete', 'never'] as const;

export type ApprovalLevel = (typeof APPROVAL_LEVELS)[number];

export type ToolKind = 'read' | 'write' | 'delete';

const KIND_RANK: Record<ToolKind, number> = { delete: 1, read: 3, write: 2 };

const LEVEL_THRESHOLD: Record<ApprovalLevel, number> = {
  all: 3,
  delete: 1,
  never: 0,
  write: 2,
};

export function asksBefore({
  kind,
  level,
}: {
  kind: ToolKind;
  level: ApprovalLevel;
}): boolean {
  return KIND_RANK[kind] <= LEVEL_THRESHOLD[level];
}
