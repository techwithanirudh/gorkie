# GitHub App setup

Gorkie connects to GitHub through a GitHub App. People sign in from Slack's App
Home with the OAuth device flow. They get a short code like `WDJB-MJHT`, enter
it at <https://github.com/login/device>, and choose which repositories Gorkie
may use. Gorkie then calls GitHub's API with that person's user access token,
so it acts as them, limited to the repos they picked.

Gorkie needs no inbound network access. It never receives webhooks and never
handles an OAuth callback. All traffic is outbound, so this works behind
Tailscale or anywhere else.

Register the app once. Hand the prompt below to an agent, or follow it
yourself.

## Prompt for registering the app

````markdown
Register a GitHub App for the Gorkie Slack bot and report back the credentials.

## Context
Gorkie is a Slack bot. People connect their own GitHub account from Slack's App
Home using the OAuth device flow (they get a short code, enter it at
github.com/login/device, and pick which repos Gorkie may use). Gorkie then calls
GitHub's API with that person's user access token, so it acts as them, limited to
the repos they picked.

Gorkie needs no inbound network access. It never receives webhooks and never
handles an OAuth callback. All traffic is outbound.

## Create the app
Go to https://github.com/settings/apps/new (or an org's
Settings > Developer settings > GitHub Apps > New GitHub App).

| Field | Value |
| --- | --- |
| GitHub App name | `Gorkie` (must be unique across GitHub; if taken, try `Gorkie Slack`) |
| Description | `Gorkie works with your GitHub repositories from Slack: reading code, opening issues, and raising pull requests as you. It only touches repositories you choose here, and only what your own account can already do. Anything it opens carries your name.` |
| Homepage URL | any URL you control, e.g. the repo URL. Not used at runtime. |
| Callback URL | leave blank if allowed. If the form insists, `http://localhost/callback` (never called). |
| Expire user authorization tokens | checked (default). Gorkie refreshes them automatically. |
| Request user authorization (OAuth) during installation | unchecked. See below. |
| Enable Device Flow | checked. REQUIRED, the whole flow depends on it |
| Webhook > Active | unchecked. No webhook URL, no secret. |
| Where can this GitHub App be installed? | `Any account` if people outside your org will use it, otherwise `Only on this account` |

## Repository permissions
Set only these; leave everything else "No access".

| Permission | Access |
| --- | --- |
| Contents | Read and write |
| Issues | Read and write |
| Pull requests | Read and write |
| Metadata | Read-only (mandatory, auto-selected) |
| Actions | Read-only |
| Checks | Read-only |
| Commit statuses | Read-only |

Write access is narrower than the table looks. Of the 33 GitHub tools, none
needs Contents write: their exact requirement, derived from the SDK's own
per-tool scope catalog, is `contents:read`, `metadata:read`,
`pull_requests:read`, `pull_requests:write`, `issues:read`, `issues:write`,
`actions:read`, `checks:read`, `statuses:read`. Contents write is here for one
reason only, `github_push_branch`, which pushes commits and cannot work
without it. Drop Contents to Read-only if you do not want gorkie pushing
branches, and everything else keeps working.

Actions write is deliberately absent. Nothing triggers, cancels or reruns a
workflow: CI mutation is excluded from the tool surface on purpose, so
granting it adds risk and buys nothing. Checks and Commit statuses are needed
read-only because `github_get_ci_failure_context` and the check-run tools read
them. Discussions and Projects are not used at all.

Do NOT grant Administration, or anything under Organization permissions,
unless specifically asked.

Subscribe to no events.

## Installing is a separate step
Creating the app does not give it access to anything. After creating it, click
"Install App", pick the account, and choose "Only select repositories" to
control what Gorkie can reach. Signing in from Slack authorises a person; it
does not install the app or grant repository access.

## After creating
1. Note the Client ID (looks like `Iv23li...`). Not the App ID, and not the
   client secret yet.
2. Click "Generate a new client secret", copy it immediately, it is shown once.
3. Do NOT generate a private key. Gorkie does not use one.
4. Click "Install App", choose the account or org, and select the repositories
   Gorkie should reach. "Only select repositories" is preferred.

## Report back
- `GITHUB_APP_CLIENT_ID` = the Client ID
- `GITHUB_APP_CLIENT_SECRET` = the client secret
- Which account/org it was installed on, and how many repositories
- Confirm Device Flow is enabled and webhooks are off

These two values go in Gorkie's `.env`. Both are required; the bot will not
start without them.
````

## Why these settings

**Enable Device Flow** is the one that breaks everything if missed. Without it
`createDeviceCode` returns 404 and nobody can sign in.

**Request user authorization (OAuth) during installation is off** because Gorkie
has no callback to receive what it sends. Ticking it makes GitHub finish every
installation by redirecting to the callback URL with an authorization code
attached, so with a placeholder callback each person lands on a dead page
reading `localhost/callback?code=…&installation_id=…`. The install still works
and the code is discarded. Leaving the box off ends the installation on GitHub's
own confirmation page instead.

Installing and signing in therefore stay separate. The device flow has no
callback by design, so it cannot receive an installation result. App Home covers
the gap by calling `GET /user/installations` after sign-in and showing an
install link when nobody has installed anything.

GitHub's web flow is the obvious alternative, and it does install and authorise
in one pass, but only by redirecting to a callback GitHub's servers can reach.
Gorkie's own server is not publicly exposed, so that callback would have to be a
second deployment, and the only way for it to hand the token back is to write to
Gorkie's database directly. That means copying both `DATABASE_URL` and
`CREDENTIALS_KEY` into another service, a poor trade for saving one step in
something each person does once.

**No private key.** A private key mints installation tokens, which act as
`gorkie[bot]` rather than as a person. Gorkie uses user access tokens so actions
carry the name of whoever asked. Only the client id and secret are read.

**No webhooks.** Those are for an app that reacts to GitHub events, which would
need a public HTTPS endpoint. Gorkie is driven from Slack.

**Expiring tokens** are GitHub's default, and Gorkie refreshes them five minutes
before they lapse. Unchecking that box is supported too. Tokens then never
expire, `githubAccessToken` skips the refresh path, and
`GITHUB_APP_CLIENT_SECRET` goes unused. That is one fewer failure mode, paid for
with credentials that live forever.

## After it exists

Set both values in `.env`:

```bash
GITHUB_APP_CLIENT_ID="Iv23li..."
GITHUB_APP_CLIENT_SECRET="..."
```

Anyone in Slack can then open Gorkie's Home tab and click **Sign in with
GitHub**. To change which repositories are shared later, they go to
<https://github.com/settings/installations> without touching Slack.
