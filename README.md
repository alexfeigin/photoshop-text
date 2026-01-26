# Photoshop Text Renderer

This is a browser-based text rendering tool that applies a Photoshop-like effect stack (layers) and exports a **transparent PNG**.

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
