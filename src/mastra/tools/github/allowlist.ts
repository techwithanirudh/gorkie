import { GITHUB_WRITE_TOOLS, type GithubToolName } from '@github-tools/sdk';
import { logger } from '../../lib/logger';

const READ_TOOLS: GithubToolName[] = [
  'compareCommits',
  'getCiFailureContext',
  'getCommit',
  'getFileContent',
  'getIssueContext',
  'getPullRequestContext',
  'getRepository',
  'getRepositoryTree',
  'listBranches',
  'listCheckRuns',
  'listCommits',
  'listIssueComments',
  'listIssues',
  'listLabels',
  'listPullRequestFiles',
  'listPullRequestReviews',
  'listPullRequests',
  'searchCode',
  'searchIssues',
  'searchRepositories',
];

const WRITE_TOOLS: GithubToolName[] = [
  'addAssignees',
  'addIssueComment',
  'addLabels',
  'addPullRequestComment',
  'closeIssue',
  'createIssue',
  'createPullRequest',
  'forkRepository',
  'removeAssignees',
  'removeLabel',
  'requestReviewers',
  'updateIssue',
  'updatePullRequest',
];

export const isWriteTool = (name: GithubToolName): boolean =>
  name in GITHUB_WRITE_TOOLS;

const misgrouped = [
  ...WRITE_TOOLS.filter((name) => !isWriteTool(name)),
  ...READ_TOOLS.filter(isWriteTool),
];
if (misgrouped.length > 0) {
  // Drop them rather than throwing: a reclassified tool would otherwise be
  // gated at the wrong approval level, and a module-level throw takes the whole
  // Slack bot down at startup over one dependency bump.
  logger.error(
    '[github] read/write split disagrees with the SDK, dropping those tools',
    { misgrouped }
  );
}

export const ALLOWLIST: GithubToolName[] = [
  ...READ_TOOLS,
  ...WRITE_TOOLS,
].filter((name) => !misgrouped.includes(name));
