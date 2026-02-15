# Code Smells / Spaghetti / Redundancy Backlog

This is a backlog-style report focused on code smells, redundancy, and design principle violations.

Each item includes:

- **Reference**: `file:lineStart-lineEnd`
- **Evidence snippet**: short excerpt to confirm it’s the same code
- **How to re-find**: a command (static tool) or grep query

## Reproducible analysis commands (run from repo root)

### 1) Copy/paste detection (redundancy)

```sh
npx -y jscpd@4 src tests --reporters console --min-lines 5 --min-tokens 50
```

### 2) Dependency graph (spaghetti indicator)

```sh
npx -y madge@6 --circular src
```

Expected output anchor:

- `✔ No circular dependency found!`

### 3) ESLint (complexity / oversized functions)

This run uses ESLint without repo config lookup and enables a small rule set aimed at maintainability.

```sh
npx -y eslint@9 src/**/*.js tests/**/*.mjs --no-config-lookup \
  --rule "complexity:[2,20]" \
  --rule "max-lines:[1,400]" \
  --rule "max-lines-per-function:[1,120]" \
  --rule "max-depth:[1,5]" \
  --rule "max-nested-callbacks:[1,3]" \
  --rule "max-params:[1,6]" \
  --rule "max-statements:[1,80]" \
  --rule "no-inner-declarations:2" \
  --rule "no-implicit-coercion:1" \
  --rule "no-multi-assign:1" \
  --rule "no-unused-vars:1" \
  --rule "prefer-const:1" \
  --rule "no-warning-comments:1"
```

## Backlog items

## SMELL-001: Massive “god function” in renderer (`renderToCanvas`)

- **Type**: complexity / single responsibility violation / hard-to-test core
- **Reference**: `src/renderer.js:134-673`
- **Tool evidence**: ESLint reported:
  - `renderToCanvas has too many lines (540)`
  - `renderToCanvas has too many statements (309)`
  - `renderToCanvas complexity 96`

- **Evidence snippet** (`src/renderer.js:134-166`):

```js
export function renderToCanvas({
  canvas,
  text,
  fontSize,
  scaleX,
  scaleY,
  alignment,
  padding,
  arcPct,
  showBg,
  bgColor,
  layers,
  scale,
  targetWidth,
  targetHeight,
  anchor,
  offsetX,
  offsetY,
  style,
}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const sxRaw = Number(scaleX);
  const syRaw = Number(scaleY);
```

- **Why it matters**:
  - Rendering, layout measurement, effect rendering, and arc warping are tightly coupled.
  - Any change risks regressions and performance issues.

- **Suggested fix direction**:
  - Split into focused functions:
    - `computeMetrics()`
    - `computeEffectExtents()`
    - `renderLayerStack()` (dispatch per layer type)
    - `applyArcWarp()`

- **Done when**:
  - `renderToCanvas` reduced to orchestration (e.g., <150 LoC)
  - layer-type renderers are individually testable.

## SMELL-002: Arc warp is a heavy per-pixel loop on main thread

- **Type**: performance smell / UI freeze risk
- **Reference**: `src/renderer.js:548-669`

- **Evidence snippet** (`src/renderer.js:548-665`):

```js
const arc = clamp(Number(arcPct) || 0, 0, 100);
if (arc > 0) {
  const w0 = canvas.width;
  const h0 = canvas.height;
  const src = document.createElement('canvas');
  src.width = w0;
  src.height = h0;
  // ...
  const srcImg = sctx2.getImageData(0, 0, w0, h0);
  const outImg = ctx.createImageData(w0, h1);
  // ...
  for (let x = 0; x < w0; x++) {
    for (let y = 0; y < h1; y++) {
      // bilinear sampling
    }
  }
}
```

- **How to re-find**:

```sh
grep -n "createImageData" -n src/renderer.js
grep -n "for (let x = 0; x < w0" -n src/renderer.js
```

- **Why it matters**:
  - O(w*h) loops with `ImageData` allocations will freeze for large exports.

- **Suggested fix direction**:
  - Preview: lower-resolution warp (scale down, warp, scale up).
  - Export: keep high quality.
  - Optionally OffscreenCanvas + Worker.

- **Done when**:
  - Preview remains responsive for large text and high scales.

## SMELL-003: UI orchestration “god function” (`init`) and high complexity helpers

- **Type**: complexity / mixed concerns
- **Reference**: `src/main.js:170-531`
- **Tool evidence**: ESLint reported:
  - `init has too many lines (360)`
  - `init complexity 32`
  - `applySessionUi complexity 21`

- **Evidence snippet** (`src/main.js:170-203`):

```js
async function init() {
  const expertMode = isExpertMode();
  setModeClass(expertMode);

  const style = {
    fontFamily: '"Mikado"',
    fontWeight: 900,
    lineHeight: 1.05,
    effectPad: 30,
  };

  const els = getEls();
  const state = createDefaultState();
```

- **Why it matters**:
  - `init` contains: mode logic, changelog modal, session persistence, preset load, render scheduling, and test hooks.

- **Suggested fix direction**:
  - Split into modules or functions: `initChangelog`, `initSession`, `initPresets`, `initRenderer`, `initTestHooks`.

## SMELL-004: `bindUI` and the editor input handler are too complex

- **Type**: complexity / maintainability
- **Reference**:
  - `src/ui.js:298-640` (`bindUI`)
  - `src/ui.js:473-562` (input handler)

- **Tool evidence**:
  - `bindUI has too many lines (342)`
  - `bindUI complexity 21`
  - `Arrow function has a complexity of 30` (the `input` handler)

- **Evidence snippet** (`src/ui.js:473-551`):

```js
els.layerEditorBody?.addEventListener('input', (e) => {
  const target = e.target;
  const field = target.getAttribute?.('data-field');
  const hexFor = target.getAttribute?.('data-hex-for');
  if (!field && !hexFor) return;
  // ... many branches ...
  if (typeof field === 'string' && field.startsWith('stop.')) {
    // ...
  } else {
    updateLayer(state, id, { params: { [field]: val } });
  }
});
```

- **Suggested fix direction**:
  - Extract field parsing to pure helpers:
    - `parseEditorEventTarget(target)`
    - `applyStopEdit(...)`
    - `applyLayerParamEdit(...)`

## SMELL-005: Repeated temp-canvas allocations per effect

- **Type**: performance smell / memory churn
- **Reference**:
  - `src/renderer.js:328-371` (outerGlow temp canvas)
  - `src/renderer.js:505-541` (stroke temp canvas)

- **How to re-find**:

```sh
grep -n "document\.createElement('canvas')" src/renderer.js
```

- **Evidence snippet** (`src/renderer.js:328-333`):

```js
const tmp = document.createElement('canvas');
tmp.width = canvas.width;
tmp.height = canvas.height;
const tctx = tmp.getContext('2d');
```

- **Suggested fix direction**:
  - Reuse a single scratch canvas per render pass.
  - Avoid full-size temp canvases when possible.

## SMELL-006: `innerHTML` usage (XSS footgun + hard-to-maintain UI rendering)

- **Type**: safety/design smell
- **Reference**:
  - `src/ui.js:271-295`
  - `src/main.js:256-256` (changelog body)
  - `src/main.js:441-467` (preset selects)

- **How to re-find**:

```sh
grep -n "innerHTML" -n src/main.js src/ui.js
```

- **Evidence snippet** (`src/ui.js:271-295`):

```js
els.layersList.innerHTML = state.layers
  .map((l, idx) => {
    // ... template string ...
  })
  .join('');
```

- **Why it matters**:
  - You escape dynamic fields currently, which is good.
  - But string-template + `innerHTML` is easy to regress (someone forgets escaping later).

- **Suggested fix direction**:
  - Use DOM APIs for high-risk sections, or centralize and enforce escaping.

## SMELL-007: High duplication in tests (`serveStatic` and friends)

- **Type**: redundancy / DRY violation
- **Tool evidence**: jscpd clones include:
  - `tests/ui-load.mjs [1:1 - 74:10]` vs `tests/preview-fit.mjs [1:1 - 61:16]`
  - `tests/gradient-stops.mjs [8:8 - 67:16]` vs `tests/ui-load.mjs [6:13 - 78:10]`

- **Evidence snippet** (`tests/ui-load.mjs:12-59`):

```js
function serveStatic(rootDir) {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = (req.url || '/').split('?')[0];
      const safePath = urlPath === '/' ? '/index.html' : urlPath;
      const resolved = path.resolve(rootDir, '.' + safePath);
      // ... content-type switch ...
```

- **Suggested fix direction**:
  - Create `tests/helpers/serve-static.mjs` and import it.

- **Done when**:
  - `jscpd` no longer reports large clones across test files.

## SMELL-008: Duplicate HTML escaping helpers

- **Type**: redundancy / drift risk
- **Tool evidence**: jscpd clone
  - `src/main.js [191:2 - 203:20]` vs `src/ui.js [66:4 - 78:18]`

- **Evidence snippet** (`src/main.js:194-201`):

```js
function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
```

- **Suggested fix direction**:
  - Move to a small `src/util/dom.js` (or similar) and import.

## SMELL-009: Minor unused variables and dead imports

- **Type**: hygiene smell
- **Tool evidence**: ESLint warnings:
  - `src/main.js:1` `getGradientMidColor` imported but unused
  - `src/renderer.js:272` `blockBottom` assigned but unused
  - `src/serialize.js:47,90` destructures `locked` but never uses it

- **Suggested fix direction**:
  - Clean up unused vars/imports (or document why they exist).

## Notes

- **No circular dependencies found** (`madge --circular src`). This is a good sign: the module graph is not “spaghetti”.
- The main issues are **local complexity hotspots** + **copy/paste duplication**, not systemic architectural chaos.
