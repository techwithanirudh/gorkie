import type { GitHubPermission } from '../../types';

type Policy = (permission: GitHubPermission) => boolean;

const read: Policy = (permission) => permission === 'all';
const write: Policy = (permission) => permission !== 'never';

export const POLICIES: Record<string, Policy> = {
  addAssignees: write,
  addIssueComment: write,
  addLabels: write,
  addPullRequestComment: write,
  closeIssue: write,
  compareCommits: read,
  createIssue: write,
  createPullRequest: write,
  forkRepository: write,
  getCiFailureContext: read,
  getCommit: read,
  getFileContent: read,
  getIssueContext: read,
  getPullRequestContext: read,
  getRepository: read,
  getRepositoryTree: read,
  listBranches: read,
  listCheckRuns: read,
  listCommits: read,
  listIssueComments: read,
  listIssues: read,
  listLabels: read,
  listPullRequestFiles: read,
  listPullRequestReviews: read,
  listPullRequests: read,
  removeAssignees: write,
  removeLabel: write,
  requestReviewers: write,
  searchCode: read,
  searchIssues: read,
  searchRepositories: read,
  updateIssue: write,
  updatePullRequest: write,
};

export const checkoutPolicy = read;
export const pushPolicy = write;
