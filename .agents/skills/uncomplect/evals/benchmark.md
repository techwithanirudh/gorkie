# Uncomplect benchmark

Date: 2026-08-21

Model: `openai-codex/gpt-5.6-sol` with high thinking

## Method

Three public-safe architecture prompts ran once in each configuration:

- **Baseline:** Pi with skill discovery disabled.
- **With skill:** Pi with skill discovery disabled and only `uncomplect/SKILL.md` loaded.

Both configurations answered the same `evals.json` prompts. A fresh skill-free grader scored each expectation from the saved outputs. Keyword mention did not pass without a concrete design, boundary, state model, cutover step, or deletion target.

The first rubric was saturated: both configurations scored 18/18. The prompts themselves gave a strong architecture model enough clues to produce the core design. The rubric was then tightened to test the skill's intended review behavior: explicit local-versus-global verdicts, complection maps, representation counts, five-axis interface comparison, and classified unknowns.

## Result

| Eval | Baseline | With skill |
| --- | ---: | ---: |
| Stale hold and contract migration | 4/8 | 8/8 |
| Webhook lifecycle and failure model | 4/8 | 8/8 |
| Distributed access policy | 3/8 | 8/8 |
| **Total** | **11/24 (45.8%)** | **24/24 (100%)** |

The skill won 13 expectations. Eleven core architecture expectations passed in both configurations. No expectation favored the baseline. No expectation failed both.

## What changed

The baseline already produced viable seams, typed decisions, lifecycle modes, staged cutovers, and deletion lists.

The skill consistently added:

- an explicit verdict about local machinery versus overall simplicity;
- a four-column complection map;
- old-versus-proposed representation counts;
- the full caller-burden and hidden-knowledge comparison for competing interfaces;
- an unknowns ledger that separates known unknowns from suspected unknown unknowns;
- one material question instead of a generic risk list.

The with-skill output used 3,592 words across three reviews. The baseline used 1,970. The skill buys a more explicit pressure test at the cost of about 82% more prose.

## Trigger check

A fresh skill-free model classified the 20 prompts in `trigger-evals.json` from the frontmatter description alone:

- 10/10 should-trigger prompts matched;
- 10/10 near-miss prompts stayed out;
- 0 false positives;
- 0 false negatives.

The narrow implementation prompts for XState, Effect retries, React props, and SQL migration stayed out because the description anchors the skill to stateful-system pressure tests and replacement design.

## Limits

This is one run per configuration on one model. It tests behavioral lift, not statistical reliability or trigger accuracy across harnesses. `trigger-evals.json` records the should-trigger and should-not-trigger set for later model-specific routing tests.
