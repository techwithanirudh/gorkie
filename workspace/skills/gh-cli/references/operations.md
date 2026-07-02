# GitHub CLI Operations

Use `gh` for GitHub. Gorkie should act as the `gorkie-agent` account when host credentials are configured.

## Auth And Identity

```bash
gh auth status
gh api user --jq '{login, id, html_url}'
```

If `gh auth status` says auth is missing but `GH_TOKEN` exists, try a small API call:

```bash
gh api user --jq '.login'
```

If both fail, stop and report that GitHub credentials are unavailable.

## Repository Context

```bash
gh repo view owner/repo --json nameWithOwner,url,defaultBranchRef,viewerPermission,description,isPrivate
gh repo view --json nameWithOwner,url,defaultBranchRef,viewerPermission
gh repo clone owner/repo
gh repo fork owner/repo --clone=false
gh repo list owner --limit 50 --json nameWithOwner,url,isPrivate,description
```

Use `--json` and `--jq` for compact output.

## Search

```bash
gh search repos "query" --limit 20 --json fullName,url,description,visibility
gh search issues "query repo:owner/repo" --limit 20 --json number,title,url,state,author
gh search prs "query repo:owner/repo" --limit 20 --json number,title,url,state,author
gh search code "query repo:owner/repo" --limit 20
```

Prefer targeted searches. Broad code search can produce noisy output.

## Issues

```bash
gh issue list -R owner/repo --state open --limit 50 --json number,title,url,labels,assignees
gh issue view 123 -R owner/repo --comments
gh issue create -R owner/repo --title "Title" --body-file issue.md
gh issue comment 123 -R owner/repo --body-file comment.md
gh issue edit 123 -R owner/repo --add-label bug
gh issue close 123 -R owner/repo --comment "Closing with context."
gh issue reopen 123 -R owner/repo
```

Use `gh api` for issue types, projects, custom fields, or other fields not supported by typed commands.

## Pull Requests

```bash
gh pr list -R owner/repo --state open --limit 50 --json number,title,url,state,reviewDecision,headRefName
gh pr view 123 -R owner/repo --comments --json title,body,state,url,files,reviewDecision,statusCheckRollup
gh pr diff 123 -R owner/repo
gh pr checkout 123 -R owner/repo
gh pr create --base main --head branch-name --title "Title" --body-file pr.md
gh pr comment 123 -R owner/repo --body-file comment.md
gh pr review 123 -R owner/repo --comment --body-file review.md
gh pr ready 123 -R owner/repo
gh pr merge 123 -R owner/repo --squash --delete-branch
```

Do not merge PRs unless the user explicitly asks and the repo policy is clear.

## Workflow Runs

```bash
gh run list -R owner/repo --limit 20 --json databaseId,name,status,conclusion,event,headBranch,url
gh run view RUN_ID -R owner/repo --log-failed
gh run view RUN_ID -R owner/repo --json jobs,conclusion,url
gh workflow list -R owner/repo
gh workflow run workflow.yml -R owner/repo --ref main
gh run rerun RUN_ID -R owner/repo --failed
```

For failing CI, inspect failed logs first, then inspect files locally.

## Releases

```bash
gh release list -R owner/repo --limit 20
gh release view v1.2.3 -R owner/repo
gh release create v1.2.3 --repo owner/repo --title "v1.2.3" --notes-file notes.md
gh release upload v1.2.3 ./dist/file.zip --repo owner/repo
gh release edit v1.2.3 --repo owner/repo --notes-file notes.md
```

## Gists

```bash
gh gist list --limit 20
gh gist view GIST_ID
gh gist create file.txt --desc "Description" --public
```

Avoid public gists for private logs, Slack links, tokens, or user data.

## Output Discipline

- Use `--json`, `--jq`, and `--limit`.
- Write long bodies to files and pass `--body-file`.
- Save huge logs to files, summarize the relevant lines, then mention the file path.
- Never print tokens or authorization headers.
