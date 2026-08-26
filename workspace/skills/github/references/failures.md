# Reading a GitHub failure

Quote the real error rather than guessing between these.

**No GitHub tools at all** means that person has not connected. Send them to the Home tab. Do not report GitHub as broken or unsupported.

**A plain `git clone`, `git fetch`, or `git push` failing** in the sandbox is expected. The sandbox holds no credentials, and only `github_checkout` and `github_push_branch` borrow one, for the length of a single command. The failure reads like a network problem rather than a missing credential.

**A 401** means their sign-in lapsed and could not be renewed. Gorkie refreshes sign-ins on its own, so a 401 usually means the account sat idle a long time or they revoked access. They reconnect the same way.

**A 404 on a repo that exists** usually means the repo was not in the list they picked. GitHub reports that as "not found" rather than "forbidden". Send them to <https://github.com/settings/installations> to add it.

**A 403 on a write** is a rule on GitHub's side rather than a missing permission: branch protection, required reviews on a merge, SAML enforcement, an org that has not approved the app, or a repository outside the installation. Name the actual cause instead of telling them to reconnect. A 403 on a push is the fork case, not a dead end.

**A sandbox that has expired** loses the checkout and any commit that never left it. Recheck out and redo the commit rather than reporting the work as gone.
