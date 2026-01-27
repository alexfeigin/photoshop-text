# Photoshop Text Renderer

This is a browser-based text rendering tool that applies a Photoshop-like effect stack (layers) and exports a **transparent PNG**.

## Deployed

- Default UI:
  - https://alexfeigin.github.io/text/
- Expert mode:
  - https://alexfeigin.github.io/text/?expert=yes

## Run locally

This is a static site (no build step required). You just need to serve the repo with a local HTTP server (opening `index.html` via `file://` may not work due to browser restrictions).

- Using Python:
  - `python3 -m http.server 5173`
  - Open:
    - http://localhost:5173/
    - http://localhost:5173/?expert=yes

- Run tests:
  - `npm test`

## Modes

The app has two UI modes:

- Regular mode (default)
  - Intended for non-expert users.
  - You can:
    - Select a preset from a dropdown.
    - Enter text.
    - Export a transparent PNG.
  - You cannot edit the effect layers.

- Expert mode
  - The original full UI.
  - Open the app with:
    - `?expert=yes`
  - You can edit layers, import/export configs, tweak sizing/scaling/alignment/padding, etc.

## Presets

Presets are JSON configs stored in:

- `presets/*.json`

### Where the preset list is defined

The list of presets shown in **regular mode** is intentionally **hardcoded** in one place:

- `src/preset.js` (`PRESETS`)

### How to add a new preset

1. Add a new JSON file under:
   - `presets/your-new-preset.json`

2. Add it to the `PRESETS` array in:
   - `src/preset.js`

Example:

```js
export const PRESETS = [
  // ...existing presets...
  { id: 'my-preset', label: 'My Preset', url: 'presets/my-preset.json' },
];
```

Notes:
- `id` should be unique.
- `label` is what appears in the dropdown.
- `url` must match the file path under `presets/`.

## Development / Tests

- Run tests:
  - `npm test`

The visual regression test uses Playwright and compares rendered output against a reference PNG.

## Link preview (WhatsApp / social tiles)

The app sets Open Graph / Twitter metadata in `index.html` so that when you paste the URL into services that unfurl links (WhatsApp, Slack, etc.), it shows a rich preview tile (title/description/image).
