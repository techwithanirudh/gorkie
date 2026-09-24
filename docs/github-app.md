# GitHub App setup

Gorkie connects to GitHub through a GitHub App. People connect from Slack's App
Home: **Connect GitHub** opens a browser page on Gorkie's server, GitHub's
standard web sign-in, and a callback back to Gorkie. Gorkie then calls GitHub's
API with that person's user access token, so it acts as them, limited to the
repositories they installed the app on.

The sign-in needs Gorkie's public HTTPS URL (`PUBLIC_BASE_URL`, see
[webhook-mode.md](./webhook-mode.md)). Without it the Home tab says GitHub
sign-in is not set up and shows no Connect button.

Register the app once. Hand the prompt below to an agent, or follow it
yourself.

## Prompt for registering the app

````markdown
Register a GitHub App for the Gorkie Slack bot and report back the credentials.

## Context
Gorkie is a Slack bot. People connect their own GitHub account from Slack's App
Home through GitHub's OAuth web flow. Gorkie then calls GitHub's API with that
person's user access token, limited to the repos they installed the app on.
Gorkie's public base URL is <PUBLIC_BASE_URL> (for example
https://gorkie.example.com).

## Create the app
Go to https://github.com/settings/apps/new (or an org's
Settings > Developer settings > GitHub Apps > New GitHub App).

| Field | Value |
| --- | --- |
| GitHub App name | `Gorkie` (must be unique across GitHub; if taken, try `Gorkie Slack`) |
| Description | `Gorkie works with your GitHub repositories from Slack: reading code, opening issues, and raising pull requests as you. It only touches repositories you choose here, and only what your own account can already do. Anything it opens carries your name.` |
| Homepage URL | any URL you control, e.g. the repo URL. Not used at runtime. |
| Callback URL | `<PUBLIC_BASE_URL>/oauth/github/callback`. For local development add a second one, `http://localhost:4111/oauth/github/callback`. |
| Expire user authorization tokens | checked (default). Gorkie refreshes them automatically. |
| Request user authorization (OAuth) during installation | unchecked. See below. |
| Enable Device Flow | unchecked. Gorkie no longer uses it. |
| Setup URL | `<PUBLIC_BASE_URL>/oauth/github/installed` |
| Redirect on update | checked |
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

Write access is narrower than the table looks. Of the 32 SDK tools in
`src/mastra/tools/github/allowlist.ts`, none needs Contents write: their exact
requirement, derived from the SDK's own per-tool scope catalog, is
`contents:read`, `metadata:read`, `pull_requests:read`, `pull_requests:write`,
`issues:read`, `issues:write`, `actions:read`, `checks:read`, `statuses:read`.
Recompute it after changing the allowlist (last run 2026-09-24, `@github-tools/sdk` 1.11.1,
matching the list above):

```sh
bun -e "import { connectGithubScopesForTools } from '@github-tools/sdk/connect'; import { ALLOWLIST } from './src/mastra/tools/github/allowlist'; console.log(connectGithubScopesForTools(ALLOWLIST))"
```

Contents write is here for one reason only, `github_push_branch`, which pushes commits and cannot work
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

## After creating
1. Note the Client ID (looks like `Iv23li...`). Not the App ID.
2. Click "Generate a new client secret", copy it immediately, it is shown once.
3. Do NOT generate a private key. Gorkie does not use one.

## Report back
- `GITHUB_APP_SLUG` = the app's URL slug
- `GITHUB_APP_CLIENT_ID` = the Client ID
- `GITHUB_APP_CLIENT_SECRET` = the client secret
- Confirm the Callback URL, the Setup URL with "Redirect on update", Device
  Flow off, and webhooks off
````

## Why these settings

**Callback URL** must match `PUBLIC_BASE_URL` exactly, because Gorkie sends it
as the `redirect_uri` and GitHub refuses any other. A GitHub App can list
several, so production and `http://localhost:4111` for development coexist.

**Request user authorization (OAuth) during installation is off.** With it on,
GitHub disables the Setup URL, and people who already installed the app, or
org members who can only request an install, never reach the authorization
step. It also cannot carry Gorkie's signed `state`, so the callback could not
tell which Slack user to connect. Gorkie chains the two itself instead: after
sign-in, if the person has no installations yet, the callback sends them to the
install page, and the Setup URL brings them back to a "done" page.

**Setup URL with Redirect on update** gives the install and "Configure" pages
on GitHub somewhere to return to. The page it lands on changes nothing and
never trusts the `installation_id` GitHub appends; the Home tab re-reads
installations the next time it opens.

**Device Flow off.** Gorkie used to sign people in with a device code. The web
flow replaced it, so leaving device flow on only widens what the client id can
do. Turn it off once this version is deployed.

**No private key.** A private key mints installation tokens, which act as
`gorkie[bot]` rather than as a person. Gorkie uses user access tokens so actions
carry the name of whoever asked. Only the client id and secret are read.

**No webhooks.** Those are for an app that reacts to GitHub events. Gorkie is
driven from Slack.

**Expiring tokens** are GitHub's default, and Gorkie refreshes them five minutes
before they lapse. Disconnecting from the Home tab also revokes the grant on
GitHub, so the next sign-in shows GitHub's consent screen again.

## How the sign-in is protected

The Home tab's **Connect GitHub** button carries a signed ticket (Factory's
`createStateSigner`, keyed from `CREDENTIALS_KEY`) naming the Slack user. The
page it opens shows that user's name and asks them to continue, which sets a
short-lived cookie holding a random nonce and sends them to GitHub with a
signed `state` carrying the same nonce. The callback only accepts a `state`
whose nonce matches the cookie in the same browser, so a sign-in link forwarded
to someone else cannot attach their GitHub account to another Slack user.
Tickets and states expire after ten minutes.

## Classic tokens

Classic personal access tokens are no longer supported, and a migration
deletes any that were saved. They only existed so Gorkie could fork, and the
app cannot. Gorkie now offers a diff or patch for repositories it cannot push
to.

## After it exists

Set the values in `.env`:

```bash
PUBLIC_BASE_URL="https://gorkie.example.com"
GITHUB_APP_SLUG="gorkie"
GITHUB_APP_CLIENT_ID="Iv23li..."
GITHUB_APP_CLIENT_SECRET="..."
```

Anyone in Slack can then open Gorkie's Home tab and click **Connect GitHub**.
To change which repositories are shared later, they go to
<https://github.com/settings/installations> without touching Slack.
