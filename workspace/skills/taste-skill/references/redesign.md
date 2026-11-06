# Redesign protocol: detect the mode, audit first, preservation rules, modernisation levers

Part of the `taste-skill` skill. Section numbers match the index in SKILL.md.

## 11. REDESIGN PROTOCOL

This skill handles **greenfield builds AND redesigns**. Misclassifying the mode is the single biggest source of bad redesign output.

### 11.A Detect the Mode (first action)
* **Greenfield.** No existing site, or full overhaul approved. Dial baseline from Section 1.
* **Preserving redesign.** Modernise without breaking the brand. Audit first, extract brand tokens, evolve gradually.
* **Overhaul redesign.** New visual language on top of existing content. Treat as greenfield for visuals; preserve content and IA.

If ambiguous, ask **once**: *"Should this redesign preserve the existing brand, or are we starting visually from scratch?"*

### 11.B Audit Before Touching
Document the current state before proposing changes:
* **Brand tokens.** Primary / accent colors, type stack, logo treatment, radii.
* **Information architecture.** Page tree, primary nav, key conversion paths.
* **Content blocks.** What exists, what's doing work, what's filler.
* **Patterns to preserve.** Signature interactions, recognisable hero, copy voice.
* **Patterns to retire.** AI-slop tells, broken layouts, dead links, generic stock imagery, perf traps.
* **Dial reading of the existing site.** Infer current `DESIGN_VARIANCE` / `MOTION_INTENSITY` / `VISUAL_DENSITY`. That's your starting point, not the baseline.
* **SEO baseline.** Current ranking pages, meta titles, structured data, OG cards. **A redesign that drops ranking pages or meta loses search traffic.**

### 11.C Preservation Rules
* **Do not change information architecture** unless asked. Keep page slugs, anchor IDs, primary nav labels stable for SEO and muscle memory.
* **Extract brand colors before applying Section 4.2.** A brand that is already purple stays purple. Apply the LILA RULE's override.
* **Preserve copy voice** unless asked for a rewrite. Visual modernisation ≠ content rewrite.
* **Honor existing accessibility wins.** Do not regress focus states, alt text, keyboard nav, contrast.
* **Respect existing analytics events.** Do not rename buttons, form fields, section IDs that downstream tracking depends on.

### 11.D Modernisation Levers (priority order)
Apply in order, and stop when the brief is satisfied:
1. **Typography refresh.** Biggest visual lift per unit of risk.
2. **Spacing & rhythm.** Increase section padding, fix vertical rhythm.
3. **Color recalibration.** Desaturate, unify neutrals, keep brand accent.
4. **Motion layer.** Add `MOTION_INTENSITY`-appropriate micro-interactions to existing components.
5. **Hero & key-section recomposition.** Restructure top-of-funnel using Section 10 vocabulary.
6. **Full block replacement.** Only when the existing block is unsalvageable.

### 11.E Decision Tree: Targeted Evolution vs Full Redesign
* IA, content, and SEO sound → **targeted evolution** (Levers 1-4). Most of the value at a fraction of the risk.
* Visual debt is structural (broken IA, no design system, broken mobile) → **full redesign** with strict content preservation.
* Brand itself is changing → **greenfield**.

### 11.F What Never Changes Silently
Never modify without explicit user approval:
* URL structure / route slugs.
* Primary nav labels.
* Form field names or order (breaks analytics + autofill).
* Brand logo or wordmark.
* Existing legal / consent / cookie copy.
