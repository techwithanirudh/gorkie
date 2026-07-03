---
name: gh-cli
description: Use GitHub through the `gh` CLI in Gorkie's sandbox. Use when the user asks to inspect GitHub repos, clone repos, search code/issues/PRs, open or update issues, review runs, create branches, or prepare pull requests with the gorkie-agent account.
---

# GitHub CLI

Gorkie uses the GitHub account `gorkie-agent` when GitHub credentials are available. The sandbox template preinstalls `gh` and `git`.

## First Checks

```bash
gh auth status
gh repo view --json nameWithOwner,url,defaultBranchRef
```

If auth fails, stop and say GitHub credentials are not available in the sandbox. Never ask the user to paste tokens into Slack or files.

## Workflow

1. Identify the repo with `gh repo view`, a URL from the user, or `owner/repo`.
2. For reads, use `gh repo view`, `gh issue`, `gh pr`, `gh run`, `gh search`, or `gh api`.
3. For contributions to a repo Gorkie does not own, fork first and push branches to the fork. Do not push feature branches directly to upstream.
4. For writes, summarize the intended change first when it affects public GitHub state.
5. Report URLs for created or modified issues, PRs, releases, workflow runs, and repos.

## References

- Common repository, issue, PR, run, and search commands: [Operations](references/operations.md).
- `gh api` patterns for REST and GraphQL when the typed commands are missing a feature: [API](references/api.md).
- Safe contribution flow for cloning, branching, committing, and opening PRs: [Contribution Flow](references/contribution-flow.md).
