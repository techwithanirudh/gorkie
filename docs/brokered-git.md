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
| `tools/github/git.ts` | `git()` runs a command in the sandbox; `withCredential()` opens and closes the credential window; `checkoutPath()` maps `owner/repo` to `/home/user/owner__repo` |
| `tools/github/checkout.ts` | `github_checkout`: clones or fetches, then checks out a branch |
| `tools/github/push.ts` | `github_push_branch`: pushes one local branch |
| `tools/github/index.ts` | Builds the GitHub toolset per request and sets each tool's approval |
| `lib/approval.ts` | `asksBefore()`: maps the person's approval level and a tool's kind to "ask first" |
| `lib/github/api.ts` | `repoAccess()`: reads whether a repository is private and whether the person can push |
| `workspace/network.ts` | `baseRules()`: the sandbox's rules with no GitHub credential, restored when a window closes |

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
- The window closes by restoring `baseRules()`, retried three times. If it still
  cannot close, the sandbox is killed and the tool says so, rather than leaving
  a live credential behind.
- `GIT_TERMINAL_PROMPT=0` is set in the sandbox environment
  (`workspace/sandbox.ts`), so a 401 fails instead of blocking on a username
  prompt until the sandbox times out.

Two deliberate differences from eve. eve clones once at template build so its
checkout tool only fetches; gorkie has no bootstrap step, so `github_checkout`
clones or fetches and is safe to re-run. eve serves one repository from one
directory; gorkie derives a directory per repository.

## Verified

Against `gorkie-workspace:2.0` and a real private repository. The template is
now `2.2`; these checks have not been re-run on it:

- A clone with no `github.com` rule fails (`could not read Username`); with the
  rule it succeeds.
- `git push` authenticates, and `.git/config` and the sandbox environment hold
  no credential.
- Clearing the rule mid-run revokes access immediately, and the
  `api.agentmail.to` rule survives the reset.
- Re-running checkout reuses the existing clone and fetches a branch that exists
  only on the remote.

Git never sees the header the firewall adds: a failing clone, a
`GIT_TRACE_CURL=1` run producing 3.7MB of trace, and `curl -v` all come back
with nothing credential-shaped, so git output needs no scrubbing before it is
quoted back.

`Bearer` returns 401 from GitHub's git endpoint, so the header must be `Basic`.
Git trusts E2B's interception CA with no extra configuration, so
`GIT_SSL_CAINFO` is unnecessary.

Tested with a `gho_` token from the `gh` CLI rather than a `ghu_` user token
from the GitHub App sign-in. Both are user access tokens presented the same
way, but worth reconfirming on the first real push.

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
