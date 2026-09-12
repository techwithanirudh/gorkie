import { z } from 'zod';
import type { ApprovalLevel } from './approval';

const GITHUB_PERMISSIONS = [
  'all',
  'write',
  'never',
] as const satisfies readonly ApprovalLevel[];

export type GitHubPermission = (typeof GITHUB_PERMISSIONS)[number];

export const githubPermissionSchema = z.enum(GITHUB_PERMISSIONS).catch('write');

export interface Repository {
  name: string;
  owner: string;
}
