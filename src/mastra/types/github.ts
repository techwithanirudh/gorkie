import { z } from 'zod';
import type { ApprovalLevel } from './approval';

const GITHUB_PERMISSIONS = [
  'all',
  'write',
  'never',
] as const satisfies readonly ApprovalLevel[];

export interface GitHubCredential {
  expiresAt: Date | undefined;
  login: string;
  refreshToken: string | undefined;
  token: string;
}

export type GitHubAccount = Omit<GitHubCredential, 'login'>;

export type GitHubPermission = (typeof GITHUB_PERMISSIONS)[number];

export interface GitHubSettings {
  permission: GitHubPermission;
  threads: boolean;
}

export const githubPermissionSchema = z.enum(GITHUB_PERMISSIONS).catch('all');

export const repositorySchema = z
  .string()
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/,
    'Expected "owner/repo".'
  )
  .refine(
    (value) => !['.', '..'].includes(value.split('/')[1]),
    'Expected "owner/repo".'
  );

export const branchSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$/,
    'Not a valid branch name.'
  )
  .refine(
    (value) => !(value.includes('..') || value.includes('//')),
    'Not a valid branch name.'
  )
  .refine(
    (value) => !(value.startsWith('refs/') || value === 'HEAD'),
    'Pass the branch name without a refs/ prefix.'
  );
