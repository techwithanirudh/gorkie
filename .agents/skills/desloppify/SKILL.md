---
name: desloppify
description: Review or simplify code by deleting unnecessary layers, duplicate shapes, weak fallbacks, casts, mirrored state, and custom helpers that should use source-owned contracts. Use `review` during repository review; use implementation mode when explicitly asked to perform cleanup.
---

# Desloppify

Apply repository ownership and boundary rules first.

## Review Mode

Review without editing during the pass. Find:

- duplicate helpers, facades, wrappers, dispatch tables, and pass-through layers
- local types, mappers, assertions, and fallback shapes duplicating schemas, SDKs, generated clients, Drizzle types, registries, or package exports
- broad casts and manual parsing that bypass an owned contract
- fallback shaping that hides invalid business-critical data
- mirrored component/app state derivable from query, store, server, or route truth
- misplaced logic, illegal dependency direction, or unnecessary public exports
- large files whose responsibilities can be split by owner or feature

Return findings with the unnecessary concept, correct owner, deletion/simplification opportunity, behavior risk, and proof obligation. Do not edit or enter the cleanup workflow in review mode.

## Implementation Mode

1. Identify the owner of each fact or behavior.
2. Search for package-native helpers, schemas, generated clients, exports, and local patterns.
3. Replace custom shapes or layers with the source-owned contract when dependency direction remains legal.
4. Inline thin wrappers when direct code is clearer; delete obsolete code in the same pass.
5. Preserve intentional duplication when it protects a real boundary.
6. Re-run a deletion-only pass if the diff grows.

Do not add an abstraction unless it removes more code and concepts than it introduces. Do not move code only to reduce line count, import a runtime-heavy module only for a type, or convert trusted typed flow into repeated runtime validation.

## Prevention

Classify recurring findings:

- expressible syntax shape → oxlint selector
- wrong placement/import direction → boundary matrix
- missing durable knowledge → scoped `AGENTS.md`
- context-specific judgment → review only

The second recurrence of the same stable class should produce a low-noise mechanical guard rather than another prose rule.
