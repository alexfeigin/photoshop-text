# Code Smells Remediation Plan (Prioritized: Quick Wins First)

This report is derived from `report/code-smells-backlog.md`, but reordered by **ease/low risk first** and **cross-cutting refactors last**.

## How to keep this report from going stale

Re-run the same tools used to generate the underlying findings:

```sh
npx -y eslint@9 src/**/*.js tests/**/*.mjs --no-config-lookup \
  --rule "complexity:[2,20]" \
  --rule "max-lines:[1,400]" \
  --rule "max-lines-per-function:[1,120]" \
  --rule "max-depth:[1,5]" \
  --rule "max-nested-callbacks:[1,3]" \
  --rule "max-params:[1,6]" \
  --rule "max-statements:[1,80]" \
  --rule "no-unused-vars:1" \
  --rule "prefer-const:1"

npx -y jscpd@4 src tests --reporters console --min-lines 5 --min-tokens 50

npx -y madge@6 --circular src
```

## Tier 0: Trivial hygiene (very low risk, isolated changes)

## QW-001: Remove unused import `getGradientMidColor` (DONE)

- **From**: `SMELL-009`
- **Reference**: `src/main.js:1`
- **Why it’s easy**: delete unused import; no runtime behavior change.
- **Tool anchor**: ESLint `no-unused-vars`.
- **Done when**: `eslint` no longer reports unused import.

## QW-002: Remove unused local destructures of `locked` (DONE)

- **From**: `SMELL-009`
- **References**:
  - `src/main.js:303-307`
  - `src/serialize.js:45-58`
  - `src/serialize.js:87-98`
- **Why it’s easy**: change destructuring to omit `locked` binding.
- **Tool anchor**: ESLint `no-unused-vars`.

## QW-003: Remove unused variable `blockBottom` in renderer (DONE)

- **From**: `SMELL-009`
- **Reference**: `src/renderer.js:272` (see ESLint warning)
- **Why it’s easy**: remove the assignment or use it; no observable behavior.

## QW-004: Clean up unused `catch (e)` variables in tests (DONE)

- **From**: `SMELL-009`
- **References**:
  - `tests/gradient-stops.mjs:46`
  - `tests/visual-regression.mjs:57`
- **Why it’s easy**: rename to `catch {}` or use the variable.

## Tier 1: Safe de-duplication (low risk, localized, minimal ripple)

## QW-010: Extract test server helper (`serveStatic`) into one module (DONE)

- **From**: `SMELL-007`
- **References**:
  - Primary clone: `tests/ui-load.mjs:12-59`
  - Also appears in: `tests/preview-fit.mjs`, `tests/gradient-stops.mjs`, `tests/visual-regression.mjs`, `tests/layout-sticky-preview.mjs`
- **Why it’s easy**: internal test-only refactor; should not affect shipped code.
- **Tool anchor**: `jscpd` clone groups.
- **Done when**:
  - Tests import `tests/helpers/serve-static.mjs`
  - `jscpd` duplication drops materially (or at least those clones disappear).

## QW-011: Centralize `escapeHtml` helper to avoid drift (DONE)

- **From**: `SMELL-008`
- **References**:
  - `src/main.js:194-201`
  - `src/ui.js:69-76`
- **Why it’s easy**: create a tiny utility module and update imports.
- **Risk**: low, but touches runtime code.
- **Tool anchor**: `jscpd` clone group.

## QW-012: Consolidate small math helpers (`clamp`) if desired (DONE)

- **From**: duplication noted in scan (not a top offender)
- **References**:
  - `src/main.js:8-10`
  - `src/renderer.js:1-3`
- **Why it’s easy**: optional; reduce drift.

## Tier 2: Medium refactors (moderate risk, but still bounded)

## MR-001: Reduce `innerHTML` surface area in `ui.js` layer list/editor

- **From**: `SMELL-006`
- **References**:
  - `src/ui.js:271-295` (layers list + editor body)
  - `src/main.js:441-467` (preset selects)
  - `src/main.js:256` (changelog)
- **Why it’s medium**: changes rendering method; needs careful DOM testing.
- **Suggested path**:
  - Start with the most dynamic/high-risk portion (layers list)
  - Keep templates but centralize escaping, or move to DOM builder incrementally.
- **Done when**: reduced `innerHTML` occurrences and/or a single audited escape function is used everywhere.

## MR-002: Extract pure helper functions from `bindUI` input handler

- **From**: `SMELL-004`
- **Reference**: `src/ui.js:473-562`
- **Why it’s medium**: refactor event logic; needs manual UI regression testing.
- **Done when**: ESLint complexity for the handler drops substantially.

## MR-003: Reuse scratch canvases per render pass

- **From**: `SMELL-005`
- **References**:
  - `src/renderer.js:328-371`
  - `src/renderer.js:505-541`
- **Why it’s medium**: performance refactor but touches rendering correctness.
- **Done when**: no per-layer full-size canvas allocations (or significantly fewer) per render.

## Tier 3: Large refactors / redesign (high risk, cross-cutting)

## LR-001: Break up `renderToCanvas` into smaller components

- **From**: `SMELL-001`
- **Reference**: `src/renderer.js:134-673`
- **Why it’s hard**:
  - Central function where measurement/layout/effects/warp all meet.
  - High regression risk; must preserve pixel output.
- **Suggested approach**:
  - First extract no-behavior-change helpers (pure functions), then isolate layer renderers.
- **Done when**:
  - `renderToCanvas` becomes orchestration
  - tests still pass; complexity drops significantly.

## LR-002: Redesign arc warp to avoid blocking the main thread

- **From**: `SMELL-002`
- **Reference**: `src/renderer.js:548-669`
- **Why it’s hard**:
  - Requires architectural decision (preview vs export quality, worker/offscreen canvas).
  - Changes performance characteristics and potentially visual output.
- **Done when**: large exports don’t freeze UI and output remains correct.

## LR-003: Split `init()` into subsystems (session, presets, changelog, rendering)

- **From**: `SMELL-003`
- **Reference**: `src/main.js:170-531`
- **Why it’s hard**: touches many responsibilities; easy to break init order.
- **Done when**: complexity drops; init becomes readable and testable.
