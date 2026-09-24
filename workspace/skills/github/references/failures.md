# Reading a GitHub failure

Quote the real error rather than guessing between these.

**No GitHub tools at all** usually means they are not loaded yet: search for them with `search_tools`. If the GitHub prompt block says the person has not connected, send them to the Home tab. Do not report GitHub as broken or unsupported.

<!-- TODO(slopradar): accuracy | a plain clone of a public repo succeeds with no credential (checkout.ts clones public repos without the window), and a private one fails with "could not read Username ... terminal prompts disabled" (GIT_TERMINAL_PROMPT=0, docs/brokered-git.md:67), an auth message, not a network one | say both -->
**A plain `git clone`, `git fetch`, or `git push` failing** in the sandbox is expected. The sandbox holds no credentials, and only `github_checkout` and `github_push_branch` borrow one, for the length of a single command. The failure reads like a network problem rather than a missing credential.

**A 401** means their sign-in lapsed and could not be renewed. Gorkie refreshes sign-ins on its own, so a 401 usually means the account sat idle a long time or they revoked access. Gorkie records it, and the Home tab shows it next to a **Reconnect** button. They reconnect the same way.

**A 404 on a repo that exists** usually means the repo was not in the list they picked. GitHub reports that as "not found" rather than "forbidden". Send them to <https://github.com/settings/installations> to add it.

**A 403 on a write** is a rule on GitHub's side rather than a missing permission: branch protection, required reviews on a merge, SAML enforcement, an org that has not approved the app, or a repository outside the installation. Name the actual cause instead of telling them to reconnect. A 403 on a push is the fork case, not a dead end.

**History that stops short** is the shallow checkout. `github_checkout` clones the last 50 commits, so `git log` ends there and `git blame` marks older lines with `^`. Deepening it with `git fetch` fails for the same reason a plain clone does. Say the history beyond that point was not visible rather than treating the boundary commit as the origin of those lines.

**A sandbox that has expired** loses the checkout and any commit that never left it. Recheck out and redo the commit rather than reporting the work as gone.
