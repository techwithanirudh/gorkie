# Brokered git credentials in the sandbox

The sandbox holds no GitHub token, and `gh` in it is unauthenticated. Two tools
borrow the connected person's user access token at the E2B firewall for the
length of one git operation: `github_checkout` and `github_push_branch`. While
the window is open, a network rule injects
`Authorization: Basic base64(x-access-token:TOKEN)` on egress to `github.com`,
so the remote URL stays clean and nothing lands in `.git/config`.

The design was ported from
[`vercel-labs/eve-software-factory-template`](https://github.com/vercel-labs/eve-software-factory-template)
at commit `0d630a2`.

## Where the tools run

GitHub tools act as the person who connected the account. They work in a DM
with that person. In a shared thread they work only if that person enabled
shared threads in App Home, and approvals follow their App Home approval
setting either way, except that in a shared thread "never ask" falls back to
asking before writing and `github_checkout` asks before any private clone.

## Code

All paths are under `src/mastra/`.

| File | What it does |
| --- | --- |
| `tools/github/git.ts` | `git()` runs a command in the sandbox; `withCredential()` opens and closes the credential window and requires the Slack `threadId`, which the background-job check is keyed on; `checkoutPath()` maps `owner/repo` to `/home/user/owner__repo` |
| `tools/github/checkout.ts` | `github_checkout`: clones or fetches, then checks out a branch |
| `tools/github/push.ts` | `github_push_branch`: pushes one local branch |
| `tools/github/index.ts` | Builds the GitHub toolset per request and sets each tool's approval |
| `lib/approval.ts` | `asksBefore()`: maps the person's approval level and a tool's kind to "ask first"; `levelOutsideDM()`: turns "never ask" into "ask before writing" in a shared thread |
| `lib/github/access.ts` | Applies `levelOutsideDM()` to the person's GitHub approval setting |
| `workspace/jobs.ts` | Tracks background commands per thread; `openCredentialWindow()` and `startJob()` refuse each other |
| `lib/github/api.ts` | `repoAccess()`: reads whether a repository is private and whether the person can push |

## The credential window

- `github_checkout` asks `repoAccess()` first. A public repository is cloned
  with no credential at all; only a private one (or one whose visibility cannot
  be read) opens the window, and only then does the approval setting apply.
- `github_push_branch` always opens the window and counts as a write for
  approvals. It refuses the repository's default branch, `main` and `master`.
  To push to a fork the app is installed on, `checkout` names the clone and
  `repository` names the fork. Gorkie cannot create forks.
- One window per sandbox at a time: concurrent calls on the same sandbox queue
  behind each other, so one call cannot close another's window early.
- Every git command in the window runs with `core.hooksPath=/dev/null` and
  `core.fsmonitor=false`, passed as `GIT_CONFIG_*` environment variables so they
  reach every git in a compound command. Hooks or an fsmonitor the agent wrote
  into the checkout never run with GitHub auth attached.
- The window closes by resetting the sandbox's network rules to none, retried
  three times. If it still cannot close, the sandbox is killed and the tool says
  so, rather than leaving a live credential behind.
- `GIT_TERMINAL_PROMPT=0` is set in the sandbox environment
  (`workspace/sandbox.ts`), so a 401 fails instead of blocking on a username
  prompt until the sandbox times out.

Two deliberate differences from eve. eve clones once at template build so its
checkout tool only fetches; gorkie has no bootstrap step, so `github_checkout`
clones or fetches and is safe to re-run. eve serves one repository from one
directory; gorkie derives a directory per repository.

## Background commands

The `github.com` rule covers the whole sandbox, so a background command running
while the window is open could push with the person's token and no approval.
The two refuse each other, per thread (`workspace/jobs.ts`):

- `withCredential()` calls `openCredentialWindow(threadId)`, which throws while
  `hasLiveJob(threadId)` is true, so `github_checkout` and `github_push_branch`
  fail before attaching the token. A job is a `run_background` call or an
  `execute_command` with `background` (registered in `beforeToolCall`,
  `workspace/index.ts`). It counts as live until it exits, is killed with
  `!stop`, or its deadline passes.
- `startJob()` throws while the thread's window is open, so a background
  command cannot start during a checkout or push. The window is marked open
  only for the length of `runWithToken()`, inside the per-sandbox queue.

Gaps that remain:

- A foreground `execute_command` (or any other sandbox tool) running in
  parallel in the same step is not blocked, and runs with the token attached.
- A process the agent backgrounds through the shell itself (`&`, `nohup`) is
  not a tracked job, so it does not block the window.
- The job registry lives in process memory, so after a restart the bot does
  not know about commands still running in a sandbox it reconnects to.

## Gotchas

- The header must be `Basic`. `Bearer` returns 401 from GitHub's git endpoint.
- Git trusts E2B's interception CA with no extra configuration, so
  `GIT_SSL_CAINFO` is unnecessary.
- Git never sees the header the firewall adds, so git output needs no
  scrubbing before it is quoted back.

## Residual risk

This protects the token, not the repository. While the window is open, anything
running in the sandbox can make authenticated git requests to github.com, not
only the command intended. The bound is the person's own GitHub App
installation. General egress stays open throughout, so repository contents can
still leave, which is inherent to running an agent that installs dependencies
and runs tests.

A checkout also outlives the turn. The sandbox belongs to the Slack thread, so
in a shared thread anyone in it can later read the code the checkout pulled
down. That is part of what a person accepts by enabling shared threads.
