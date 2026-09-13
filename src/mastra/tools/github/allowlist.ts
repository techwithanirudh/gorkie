import { GITHUB_WRITE_TOOLS, type GithubToolName } from '@github-tools/sdk';

// Which GitHub tools gorkie exposes: a security boundary, so an explicit
// reviewed list, not an SDK preset that could gain tools on a bump. Read/write
// is not tracked here; `isWriteTool` derives it from the SDK at the call site.
export const ALLOWLIST: GithubToolName[] = [
  'addAssignees',
  'addIssueComment',
  'addLabels',
  'addPullRequestComment',
  'closeIssue',
  'compareCommits',
  'createIssue',
  'createPullRequest',
  'forkRepository',
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
  'removeAssignees',
  'removeLabel',
  'requestReviewers',
  'searchCode',
  'searchIssues',
  'searchRepositories',
  'updateIssue',
  'updatePullRequest',
];

export const isWriteTool = (name: GithubToolName): boolean =>
  name in GITHUB_WRITE_TOOLS;
