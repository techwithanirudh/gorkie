import { isValidGitRef } from '@mastra/factory/sandbox/git-ref';
import { z } from 'zod';
import type { ApprovalLevel } from './approval';

const githubPermissions = [
  'all',
  'write',
  'never',
] as const satisfies readonly ApprovalLevel[];

export interface GitHubCredential {
  expiresAt: Date | undefined;
  lastError: string | undefined;
  login: string;
  refreshToken: string | undefined;
  token: string;
}

export type GitHubAccount = Omit<GitHubCredential, 'lastError' | 'login'>;

export type GitHubPermission = (typeof githubPermissions)[number];

export interface GitHubSettings {
  permission: GitHubPermission;
  threads: boolean;
}

export const githubPermissionSchema = z.enum(githubPermissions);

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
  .refine(isValidGitRef, 'Not a valid branch name.')
  .refine(
    (value) => !(value.startsWith('refs/') || value === 'HEAD'),
    'Pass the branch name without a refs/ prefix.'
  );
