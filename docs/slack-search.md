# Slack search setup

Gorkie's `search_slack` tool runs one Slack message search per call over
**public channels only**. DMs, private channels, and Slack Connect
conversations are never searched.

Search runs as a single workspace identity: the user token in
`SLACK_USER_TOKEN`. It calls `assistant.search.context` pinned to
`channel_types: public_channel` and re-checks the visibility of every result
channel before returning it. It runs on live, `wait` and scheduled-task turns
alike, always as the installer's public-only identity.

## The token

`SLACK_USER_TOKEN` is a **user** token (`xoxp-`), not the bot token
(`xoxb-`). Mint it with `search:read.public` and nothing else. On first use per
process gorkie calls `auth.test`, reads the granted scopes, and refuses the
token if it carries `search:read.im`, `search:read.mpim`, or
`search:read.private`, because those can read DMs and private channels. A token
missing `search:read.public` is refused too.

## Setup

1. In the app manifest, `oauth_config.scopes.user` must include
   `search:read.public` (already set in `slack-manifest.json`).
2. Install (or reinstall) the app to the workspace so the user scope is
   authorized.
3. On **OAuth & Permissions**, copy the **User OAuth Token** (`xoxp-`).
4. Put it in `.env` as `SLACK_USER_TOKEN`.
5. Restart the bot.

## Reducing scopes on an existing token

Slack OAuth user-scope grants are cumulative. If the token was ever authorized
with broader user scopes (`search:read.private/.mpim/.im`), removing them from
the manifest does **not** shrink the token that was already issued. The
OAuth page's scope list shows what the app now requests, but `auth.test` still
reports the token's original grant, so gorkie keeps refusing it. The token
string does not change, so re-copying it into `.env` fixes nothing.

To actually drop the extra scopes you must revoke and re-authorize:

1. On **OAuth & Permissions**, click **Revoke All OAuth Tokens**, or revoke
   just the user token: `curl -s https://slack.com/api/auth.revoke -d token=OLD`.
2. Reinstall the app. The fresh user token is granted only the currently
   configured scope, `search:read.public`.
3. Copy the new token into `.env` and restart.

Revoking and reinstalling swaps token values only. It does **not** remove the
bot from any channel; channel membership belongs to the installation, and only
uninstalling the app drops it. With token rotation off, the bot token value is
stable across a reinstall, so revoking all tokens still lets you re-copy the
same `xoxb-` value (or revoke only the user token to leave the bot untouched).
The signing secret is not an OAuth token and is unaffected by revoking.

## Verifying

Confirm the granted scopes without trusting the config page:

```
curl -s https://slack.com/api/auth.test -d token=xoxp-... | jq .response_metadata.scopes
```

It should list `search:read.public` and none of the DM or private variants.
