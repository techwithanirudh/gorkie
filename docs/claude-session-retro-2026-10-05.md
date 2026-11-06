# Claude Code session comparison, 2026-10-05

The newer session improved source verification and eventually measured prompt
behavior. The repeated failures came from missing checks around sensitive reads,
staging, installed patches, runtime contracts, and model-call budgets.

## Scope and evidence

Compared the latest substantive gorkie sessions by recorded activity, skipping
empty sessions and a two-command skill-symlink session:

| Session | Recorded activity, UTC | Work and result |
| --- | --- | --- |
| `77a49053` | September 11-14 | GitHub setup, Slack failures, model routing, background tasks. Source-backed diagnosis, but large accumulating changes and repeated lint/typecheck runs. |
| `eef93da7` | September 13 | Branch review and fixes. Found production migration gaps and formatter/background-wake failures despite passing static checks. |
| `ceabf928` | September 13-18 | GitHub work and deployment guidance. Identified stale setup documentation; the subsequent production boot failed with an empty observability exporter configuration. |
| `3631d458` | September 23-October 3 | PR triage, cleanup, framework migration, security reviews, Slack display work, and prompt evaluations. More delegation and explicit live-test caveats, with exposure incidents and repeated live regressions. |

Logs are in `/home/coder/.claude/projects/-workspaces-gorkie/`. Full filenames:

- `77a49053-d913-4435-aa30-6a0024c9bab7.jsonl`
- `eef93da7-c2c1-4a9a-bdb4-a52d386bd2d7.jsonl`
- `ceabf928-7084-474e-a5cd-7b18434594f2.jsonl`
- `3631d458-50f2-4057-b4d7-21eb770b8e2e.jsonl`

Line numbers below refer to those JSONL files. Five malformed lines in
`77a49053` were skipped. Parent logs contain 2,083 Bash and 46 Agent calls in
`77a49053`, compared with 602 Bash and 169 Agent calls in `3631d458`. These are
parent-log counts, not total cost or a controlled productivity comparison;
delegated tools are not included and the tasks differ.

## Improvements, ordered by severity

### 1. Prevent sensitive reads and accidental reference commits

In `3631d458:449-455`, the agent records committing a private reference ZIP with
`git add -A` and merging it into public main. The user approved a history rewrite.
The agent reported placeholders rather than live secrets in that archive.
Separately, `3631d458:1019` records a review agent printing `CREDENTIALS_KEY` and
`SLACK_USER_TOKEN` into model context through a `sed` range over `.env`.

Current `.gitignore` already excludes `.env` variants and `*.zip`; do not propose
the ZIP ignore as new work. `lefthook.yml` has commit-message and post-merge
commands, but no configured pre-commit content check. CI has no secret or staged
artifact check. An installed pre-commit hook file alone does not establish one.

Candidate: a Claude tool hook that refuses raw secret-file reads, including shell
reads, plus a redacted configuration-inspection command. Keep imported references
outside the repository. Add a staged-path/content gate for sensitive files and
unexpected archives before commits. Secret scanning alone would not catch the
private source ZIP. Check staged paths explicitly before publishing.

### 2. Check runtime contracts and wire the existing patch verifier

The older review found missing production columns even though typecheck and lint
passed (`eef93da7:169`). The newer session repeatedly hit stale installed patch
hunks (`3631d458:7145`, `7228`). It also discovered that its step-boundary split
skipped the tool-call steps it needed to handle (`7296`), and that task text
exceeded Slack's limits (`7198`).

Current CI runs typecheck, lint, and spelling. `scripts/verify-mastra-patch.ts`
exists and is wired into `postbuild`, but not CI or the ordinary `dev`/`start`
scripts. Running it during this retrospective passed. This is a historical
installation mismatch and a remaining wiring gap, not a claim that today's
installed patches are stale. Marker presence does not establish behavior.

Candidate: run the existing verifier in CI and before the user starts the bot.
Add focused checks over the actual patched implementation for task rollover,
continued steps, concurrent running tasks, title completion, and stream failure
recovery. Test migrations against a disposable database with the previous
production schema. Keep live Slack checks separate and owner-operated.

### 3. Enforce evaluation budgets in the request path

The first October 3 evaluation reportedly used about 700 model calls against an
under-150 budget (`3631d458:8295`). The follow-up comparison reported 137 calls
under a 150 cap (`8396`), and the saved `results/ab-calls.txt` independently
contains 137 A/B entries. It also contains 35 later C entries, excluded from the
A/B total. `eval-ab.ts:30-39` adds a counter before requests. The initial 700
figure is a session report, not an independently reconstructed total.

Candidate: retain a reusable evaluation runner with an enforced call cap,
counting retries and judge requests, a deadline, bounded concurrency, and a
counter safe across processes. Its report should separate genuine tool calls
from synthesized calls and identify stub failures. The saved A/B results mark
four B replies as synthetic; reporting them as genuine compliance would be wrong.
Promote the useful scratchpad harness rather than rebuilding it next time.

### 4. Preserve validation exit codes

Both major sessions repeatedly invoke checks through `| tail` without preserving
the check's exit status, sometimes joining the resulting pipelines with `&&`.
Examples: `77a49053:17065` and `3631d458:662`, `8062`, `8289`.
That reports the last pipeline command's status and can hide a failed check.
This observation does not prove a particular reported pass was false.

Candidate: one validation command that captures full logs, prints a short
summary, and exits nonzero if any required check fails. Reuse the repo's existing
commands. Configure a local hook to run it where practical. CI already invokes
the checks directly, so the gap is chiefly local agent verification.

### 5. Validate setup examples against the env contract

`ceabf928:522` identifies missing Langfuse variables in `.env.example`; `527-537`
then records the production crash when no exporter is configured. The subsequent
fix makes the keys required and updates the example. Today's example includes
them. Today's CI setup still writes obsolete Mastra Platform variables and omits
several current required values, including Langfuse and the Slack signing secret.
Static checks do not evaluate the env schema, so they miss this drift.

Candidate: a safe dummy fixture for the current env schema, an env-example
coverage check, and a production configuration check that avoids starting the
bot, scheduler, or workers. Validate from an isolated environment so the real
`.env` cannot satisfy missing fixture values. Use the local setup wizard when
giving deployment instructions; the historical session read its opening section
but ultimately returned prose rather than a wizard.

### 6. Make cleanup review preserve runtime constraints

The newer session removed about 125 comment lines (`3631d458:617`), then review
restored two why-comments and caught an empty-thread guard regression (`1000`).
It also corrected a `PROJECT_ROOT` regression and a duplicated prompt (`1019`).
The later broad cleanup caught cold-cache opt-in and reaction-name regressions
only in follow-up verification (`7039`). More review passes helped, but did not
prevent these regressions initially.

Candidate: give the reviewer a before/after behavior inventory for a cleanup and
preserve explanations of external platform facts, as the existing standards
already allow. Encode repeatable naming, banned API, and import-location rules
in deterministic checks rather than adding more prose. Keep judgment about
ownership, useful abstraction, and vendor caveats in review. When resuming work,
read the relevant IMPLEMENTED entries before revisiting a discarded design.

AGENTS.md is 85 lines and CODING_STANDARDS.md is 245 lines. The evidence does not
justify a blanket instruction rewrite or calling these files excessively large.

## What to retain

- Review against installed dependency source and production git history. The
  September 13 review found deploy-only failures that static checks missed.
- Explicitly distinguish source changes, installed patches, and live behavior.
  The newer session increasingly states when Slack testing has not happened.
- Measure alternatives. The October 3 A/B test challenged the earlier confident
  claim that required tool choice would prevent free text on this provider. Its
  reported conclusions remain limited by small samples and crude tool stubs.

This retrospective changed documentation and task tracking only. It did not
implement the proposed gates, alter dependencies or schemas, stage files,
commit, publish, or start/restart the bot. The repeatable log extractor is
`/tmp/gorkie-retro-sessions.py`; it supports bounded event reads and aggregate
counts without dumping complete sessions.
