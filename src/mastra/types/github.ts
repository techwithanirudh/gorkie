import { z } from 'zod';

// Nothing on the curated GitHub surface deletes, so the loosest preset is "never".
const GITHUB_PERMISSIONS = ['all', 'write', 'never'] as const;

export type GitHubPermission = (typeof GITHUB_PERMISSIONS)[number];

export const githubPermissionSchema = z.enum(GITHUB_PERMISSIONS).catch('write');
