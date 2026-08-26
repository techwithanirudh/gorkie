import { z } from 'zod';

const GITHUB_PERMISSIONS = ['all', 'write', 'never'] as const;

export type GitHubPermission = (typeof GITHUB_PERMISSIONS)[number];

export const githubPermissionSchema = z.enum(GITHUB_PERMISSIONS).catch('write');
