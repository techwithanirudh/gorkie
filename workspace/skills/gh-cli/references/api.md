# GitHub API Through `gh`

Use `gh api` when typed `gh` commands do not cover the operation. Prefer compact `--jq` filters.

## REST Reads

```bash
gh api repos/{owner}/{repo} \
  --jq '{name: .full_name, private, default_branch, permissions}'

gh api repos/{owner}/{repo}/branches/main \
  --jq '{name, protected, commit: .commit.sha}'

gh api repos/{owner}/{repo}/contents/path/to/file \
  --jq '{name, path, encoding, size}'

gh api search/code \
  -f q='symbol repo:owner/repo' \
  --jq '.items[] | {path, html_url}'
```

## REST Writes

Create an issue:

```bash
gh api repos/{owner}/{repo}/issues \
  -X POST \
  -f title="Issue title" \
  -f body="$(cat issue.md)" \
  --jq '{number, html_url}'
```

Comment on an issue or PR:

```bash
gh api repos/{owner}/{repo}/issues/{number}/comments \
  -X POST \
  -f body="$(cat comment.md)" \
  --jq '{html_url}'
```

Update issue state:

```bash
gh api repos/{owner}/{repo}/issues/{number} \
  -X PATCH \
  -f state=closed \
  --jq '{number, state, html_url}'
```

Dispatch a workflow:

```bash
gh api repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches \
  -X POST \
  -f ref=main
```

## GraphQL

Repository identity:

```bash
gh api graphql \
  -f owner="OWNER" \
  -f name="REPO" \
  -f query='
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
    nameWithOwner
    defaultBranchRef { name }
    viewerPermission
  }
}' \
  --jq '.data.repository'
```

Open review threads:

```bash
gh api graphql \
  -f owner="OWNER" \
  -f name="REPO" \
  -F number=123 \
  -f query='
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 50) {
        nodes {
          isResolved
          path
          line
          comments(first: 10) {
            nodes { author { login } body url }
          }
        }
      }
    }
  }
}' \
  --jq '.data.repository.pullRequest.reviewThreads.nodes'
```

## Pagination

```bash
gh api repos/{owner}/{repo}/issues --paginate \
  --jq '.[] | select(.pull_request | not) | {number, title, state}'
```

Use pagination only when needed. Paginated output can become very large.

## Headers And Previews

```bash
gh api \
  -H "Accept: application/vnd.github+json" \
  repos/{owner}/{repo}
```

Do not manually include `Authorization` headers. Let the credential path handle auth.

## Error Handling

- `401`: credentials missing or invalid.
- `403`: permissions, rate limit, abuse detection, or branch protection.
- `404`: repo does not exist, token lacks access, or endpoint path is wrong.
- `422`: invalid input or duplicate entity.

When errors are ambiguous, check:

```bash
gh auth status
gh api rate_limit --jq '.resources.core'
gh repo view owner/repo --json viewerPermission
```
