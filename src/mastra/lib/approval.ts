import type { ApprovalLevel, ToolKind } from '../types';

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

export function levelOutsideDM<T extends ApprovalLevel>({
  isDM,
  level,
}: {
  isDM: boolean;
  level: T;
}): T | 'write' {
  return isDM || level === 'all' ? level : 'write';
}
