---
name: github
description: Take a change through GitHub end to end, or sort out a GitHub account. Use when someone asks for a pull request, asks you to fix CI or address review comments, asks how to connect or sign in to GitHub, asks why GitHub tools are missing, or when a GitHub call fails on authentication or permissions.
---

# GitHub

A change is not delivered when the pull request opens. It is delivered when the checks are **green** and every review comment has an answer.

## 1. Agree the base branch

The branch a pull request merges into is not always `main`. Ask which one they want, or take it from what they already said. `github_get_repository` returns `defaultBranch`, which is the fallback when nobody has said otherwise, not a decision. Someone working on a feature branch usually wants the pull request aimed at that branch.

## 2. Work in the sandbox

`github_checkout`, then edit and commit on a feature branch. Never `main` or `master`: `github_push_branch` refuses both, so a change committed on a default branch has to be moved before it can go anywhere.

## 3. Run what CI runs, before pushing

Read `.github/workflows/` and run those exact commands, not an approximation of them. The lockfile names the package manager; `package.json` scripts and any `Makefile` name the tasks.

If the toolchain is missing, install it with `execute_command` and carry on. The sandbox is yours to set up.

Give up on running them locally only when installing genuinely fails: no network, a private registry, a toolchain too large for the sandbox. Then say which checks you could not run and why, and let the repository's CI be the runner instead. Never call a change verified because the tooling was absent.

**Done when** every check you can run locally passes, or you have named the ones you could not run and why.

## 4. Push, and fork if refused

Push to the original repository first. There is no way to check access beforehand: `github_get_repository` does not report permissions, so the push attempt is the check. Then `github_create_pull_request` into the base branch from step 1, and report the URL from the result.

A push rejected as forbidden means write access is missing, not that the work is lost. The commit is still in the sandbox.

- **On a classic token**: `github_fork_repository`, then `github_push_branch` again with the fork's full name as `repository`, then open the pull request from the fork's branch. The checkout is reused, because its directory is named after the repository rather than its owner, so nothing is recloned and the commit is unchanged.
- **On the GitHub App**: there is no fork tool, because an installation token can only fork where the app is installed. Say the App cannot reach a repository somebody else owns, then offer both ways forward: add a classic token in the Home tab, or open the pull request themselves from `https://github.com/OWNER/REPO/compare/BASE...FORK_OWNER:BRANCH?expand=1`. A person is not installation-bounded.

**Done when** the pull request exists and you have quoted its URL from a tool result.

## 5. Drive it green

`github_list_check_runs` for the state, `github_get_ci_failure_context` for a failing one. Fix the cause in the sandbox, commit, push the same branch again, and look again.

Checks take minutes. Use `wait` between looks rather than polling in a tight loop, and say what you are waiting on.

Read the failure before changing anything. A test that fails on your change and a test that was already broken on the base branch want opposite responses, and `github_get_ci_failure_context` shows you which.

**Done when** every check is green, or a named check is failing for a cause outside this change and you have said which check and why.

## 6. Answer every comment

`github_get_pull_request_context` for the review state, `github_list_pull_request_reviews` and `github_list_issue_comments` for what people wrote.

Every comment gets one of two responses: a commit that addresses it, or a reply with `github_add_pull_request_comment` explaining why not. Silence is not a response. There is no tool that resolves a review thread, so say what you changed and let the reviewer resolve it.

A comment that asks for something out of scope still gets a reply agreeing or declining, not silence.

**Done when** every comment has a commit or a reply against it, and any new commits have gone back through step 5.

## Reference

Connecting, tokens, and the Home tab settings: [references/connecting.md](references/connecting.md).

Reading a specific failure, 401, 403, 404, or a dead sandbox: [references/failures.md](references/failures.md).

## Never

- Ask for, repeat, or write down a token or a device code.
- Suggest adding GitHub as a custom MCP server. It has its own section, and the MCP form rejects it.
- Claim GitHub is connected, or that a branch, commit, pull request, or green check exists, without a tool result showing it.
