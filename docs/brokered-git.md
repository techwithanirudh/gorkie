# Brokered git credentials in the sandbox

The sandbox holds no GitHub token. `github_checkout` and `github_push_branch` borrow one at the E2B firewall for the length of a single git command: the rule injects `Authorization: Basic base64(x-access-token:TOKEN)` on egress to `github.com`, so the remote URL stays clean and nothing lands in `.git/config`.

Ported from [`vercel-labs/eve-software-factory-template`](https://github.com/vercel-labs/eve-software-factory-template) at commit `0d630a2`.

## Code

| gorkie | eve |
| --- | --- |
| `tools/github/git-remote.ts` | `agent/lib/github/git-remote.ts` |
| `tools/github/checkout.ts` | `agent/subagents/*/tools/checkout_branch.ts` |
| `tools/github/push.ts` | `agent/subagents/implementer/tools/push_branch.ts` |
| `tools/github/approval.ts` | `agent/lib/github/approval.ts` |
| `tools/github/index.ts` | `agent/extensions/github.ts` |

Two deliberate differences. eve clones once at template build so its checkout tool only fetches; gorkie has no bootstrap step, so `github_checkout` clones or fetches and is safe to re-run. eve serves one repository from one directory; gorkie derives `/home/user/<repo>` per repository.

eve's approval policies key on trusted, autonomous, and schedule callers, which gorkie has no equivalent of: every turn is one attended person acting with their own credential, so the only axis is their App Home preset.

## Verified

Against `gorkie-workspace:2.0` and a real private repository:

- A clone with no `github.com` rule fails (`could not read Username`); with the rule it succeeds.
- `git push` authenticates, and `.git/config` and the sandbox environment hold no credential.
- Clearing the rule mid-run revokes access immediately, and the `api.agentmail.to` rule survives the reset.
- Re-running checkout reuses the existing clone and fetches a branch that exists only on the remote.

Git never sees the header the firewall adds: a failing clone, a `GIT_TRACE_CURL=1` run producing 3.7MB of trace, and `curl -v` all come back with nothing credential-shaped, so git output needs no scrubbing before it is quoted back.

`Bearer` returns 401 from GitHub's git endpoint, so the header must be `Basic`. Git trusts E2B's interception CA with no extra configuration, so `GIT_SSL_CAINFO` is unnecessary. `GIT_TERMINAL_PROMPT: '0'` is set in `sandboxEnv()` so a 401 fails instead of blocking on a username prompt until the sandbox times out.

Tested with a `gho_` token from the `gh` CLI rather than a `ghu_` device-flow token. Both are user access tokens presented the same way, but worth reconfirming on the first real device-flow push.

## Residual risk

This protects the token, not the repository. While the rule is live, anything running in the sandbox can make authenticated git requests to github.com, not only the command intended. The bound is the person's own GitHub App installation. General egress stays open throughout, so repository contents can still leave, which is inherent to running an agent that installs dependencies and runs tests.

A checkout also outlives the turn in a sandbox the whole thread shares, so anyone in that thread can later read the code it pulled down.
