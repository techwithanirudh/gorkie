# Connecting an account

Connecting happens in Gorkie's **Home** tab. There is no token to create for the normal path and nothing to paste, so never ask anyone for one.

## Sending someone to connect

Everyone installs on their own account, so both steps apply to each person.

1. Click **Gorkie** in the Slack sidebar, then open the **Home** tab.
2. Click **Sign in with GitHub**. Both steps below then appear in the modal that opens.
3. **Choose repositories**: the modal links straight to the install page. This decides what Gorkie can reach. "Only select repositories" is the narrow choice.
4. **Prove who they are**: open <https://github.com/login/device>, enter the code shown, approve. The Home tab updates on its own.

The code lasts about 15 minutes. If it runs out, click **Sign in with GitHub** again for a new one.

Signing in on its own grants no access to any code. That is the confusing case, because Gorkie can still search public repositories, so it looks connected while every write fails. The Home tab says "Not installed on any repositories, so Gorkie cannot reach your code" when this has happened, next to a **Choose repositories** button. Anyone reporting that Gorkie cannot see their repo, or sees too many, is asking about step 3.

Once connected, **Manage repositories** links to <https://github.com/settings/installations>, where they add or remove repositories at any time.

## What they are granting

Gorkie signs in as a GitHub App, so the app fixes its own permissions and the person connecting cannot set them wrong. What they choose is which repositories, at step 3.

Their access is the narrowest of three things: the repos they picked, what the app is allowed to do, and what their own account can already do. Gorkie can never reach something they could not reach themselves.

Picking "All repositories" at step 3 hands over every repo on the account, which is almost never what someone means.

## Personal tokens

Someone may paste a classic personal access token instead, under **Classic token** in the connect modal. It exists because an App only reaches repositories it was installed on, so it cannot fork, and it cannot open a pull request against a repository somebody else owns. A token is not installation-bounded, so it can.

The modal offers two scopes. `public_repo` covers public repositories, other people's included. `repo` adds their own private ones, and is the only way Gorkie reaches private code while a token is set. Fine-grained tokens are refused, because they only reach the person's own repositories, which the App already covers.

A token replaces the App for every repository while it is set, and the Home tab says so.

## Settings in the Home tab

**Configure** holds two settings per connection, GitHub's own and one for each MCP server they have added.

The first is when Gorkie stops and asks. The default asks before writing or deleting; the alternatives are asking for every call, or never asking. Someone who finds the prompts tiring should change that setting rather than be talked out of caring.

The second is where GitHub tools may run. By default they run only in a DM, and in a shared thread they hand back a plan to send instead, because a thread is shared and the account is one person's. The other option lets them run in shared threads too, and says plainly what that costs.

Approving is a prompt, not a limit. What Gorkie can reach at all comes from the repositories they installed it on, and from branch protection on GitHub. If someone asks to be stopped from touching a branch, that is a GitHub rule, not something an approval setting can guarantee.

Different people in one thread can be connected as different accounts, so act on behalf of whoever made the current request, not whoever spoke first.
