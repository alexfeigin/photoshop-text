import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { DEFAULT_PRESET_URL } from '../src/preset.js';
import { serveStatic } from './helpers/serve-static.mjs';

import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/*
  NOTE: This script is intentionally NOT a regression-gating test.
  It renders the current output and compares it to a Photoshop reference image.
  The goal is to help visually tune parameters, not to enforce pixel-perfect stability.

  By default it is skipped. To run it explicitly:
    RUN_VISUAL=1 node tests/visual-regression.mjs
*/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function decodePng(buffer) {
  return PNG.sync.read(buffer);
}

function encodePng(png) {
  return PNG.sync.write(png);
}

function dataUrlToBuffer(dataUrl) {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) {
    throw new Error('Expected a PNG data URL');
  }
  return Buffer.from(dataUrl.slice(prefix.length), 'base64');
}

function cloneJson(x) {
  return JSON.parse(JSON.stringify(x));
}

async function main() {
  if (process.env.RUN_VISUAL !== '1') {
    console.log('Skipping visual reference comparison (set RUN_VISUAL=1 to run).');
    return;
  }

  const outDir = path.join(projectRoot, 'test-output');
  await mkdir(outDir, { recursive: true });

  const presetPath = path.join(projectRoot, DEFAULT_PRESET_URL);
  const presetBuf = await readFile(presetPath, 'utf8');
  const preset = JSON.parse(presetBuf);
  const presetLayers = Array.isArray(preset?.layers) ? preset.layers : [];

  const samplePath = path.join(projectRoot, 'text-sample-no-background.png');
  const sampleBuf = await readFile(samplePath);
  const samplePng = decodePng(sampleBuf);

  // Compare against the no-background reference (transparent).
  const compareWithBackground = false;
  const sampleBgColor = undefined;

  const { url, close } = await serveStatic(projectRoot);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 500 } });

  try {
    await page.goto(`${url}?expert=yes`, { waitUntil: 'networkidle' });

    async function renderActualPng(offsetX, offsetY) {
      const dataUrl = await page.evaluate(async (opts) => {
        return await window.__renderTestPngDataUrl(opts);
      }, {
        text: "LET'S CELEBRATE!",
        fontSize: 143,
        alignment: 'center',
        padding: 24,
        scale: 1,
        layers: presetLayers,
        width: samplePng.width,
        height: samplePng.height,
        anchor: 'center',
        showBg: compareWithBackground,
        bgColor: sampleBgColor,
        offsetX,
        offsetY,
      });

      const actualBuf = dataUrlToBuffer(dataUrl);
      const actualPng = decodePng(actualBuf);
      return { actualBuf, actualPng };
    }

    function diffCount(sample, actual) {
      const diff = new PNG({ width: sample.width, height: sample.height });
      const numDiffPixels = pixelmatch(
        sample.data,
        actual.data,
        diff.data,
        sample.width,
        sample.height,
        {
          threshold: 0.1,
          alpha: 0.8,
          includeAA: true,
        }
      );
      return { numDiffPixels, diff };
    }

    // Find the best alignment offsets to reduce test flakiness and focus on style.
    let best = { offsetX: 0, offsetY: 0, numDiffPixels: Infinity, actualBuf: null, diff: null };

    const range = 16;
    const step = 2;
    for (let oy = -range; oy <= range; oy += step) {
      for (let ox = -range; ox <= range; ox += step) {
        const { actualBuf, actualPng } = await renderActualPng(ox, oy);

        if (actualPng.width !== samplePng.width || actualPng.height !== samplePng.height) {
          throw new Error(
            `Size mismatch: actual ${actualPng.width}x${actualPng.height}, sample ${samplePng.width}x${samplePng.height}`
          );
        }

        const { numDiffPixels } = diffCount(samplePng, actualPng);
        if (numDiffPixels < best.numDiffPixels) {
          best = { offsetX: ox, offsetY: oy, numDiffPixels, actualBuf, diff: null };
        }
      }
    }

    // Re-render at best offset for stable artifacts + diff image.
    const { actualBuf, actualPng } = await renderActualPng(best.offsetX, best.offsetY);
    const { numDiffPixels, diff } = diffCount(samplePng, actualPng);
    best.actualBuf = actualBuf;
    best.diff = diff;

    // Optional: brute-force a small grid of preset parameters to reduce mismatch.
    // Enable with: TUNE_PRESET=1 node tests/visual-regression.mjs
    if (process.env.TUNE_PRESET === '1') {
      const baseOffsetX = best.offsetX;
      const baseOffsetY = best.offsetY;

      function findLayer(layers, type, id) {
        if (!Array.isArray(layers)) return null;
        if (id) return layers.find((l) => l && l.id === id) || null;
        return layers.find((l) => l && l.type === type) || null;
      }

      let tuneBest = { numDiffPixels: Infinity, glow: null, extrusionBlurPx: null };

      const sizePxVals = [30, 32, 34, 36, 38, 40, 42, 44];
      const dyVals = [4, 5, 6, 7, 8, 9, 10];
      const opacityVals = [52, 54, 56, 58, 60, 62, 64, 66];
      const blurVals = [0, 0.5, 1, 1.5, 2, 2.5, 3];

      for (const sizePx of sizePxVals) {
        for (const dy of dyVals) {
          for (const opacityPct of opacityVals) {
            for (const blurPx of blurVals) {
              const layers = cloneJson(presetLayers);

              const glow = findLayer(layers, 'outerGlow');
              if (glow && glow.params) {
                glow.params.sizePx = sizePx;
                glow.params.dy = dy;
                glow.params.opacityPct = opacityPct;
              }

              const extrusion = findLayer(layers, 'extrusion', 'mkpagc4j_opor3b');
              if (extrusion && extrusion.params) {
                extrusion.params.blurPx = blurPx;
              }

              const { actualPng: png } = await (async () => {
                const dataUrl = await page.evaluate(async (opts) => {
                  return await window.__renderTestPngDataUrl(opts);
                }, {
                  text: "LET'S CELEBRATE!",
                  fontSize: 143,
                  alignment: 'center',
                  padding: 24,
                  scale: 1,
                  layers,
                  width: samplePng.width,
                  height: samplePng.height,
                  anchor: 'center',
                  showBg: compareWithBackground,
                  bgColor: sampleBgColor,
                  offsetX: baseOffsetX,
                  offsetY: baseOffsetY,
                });
                const buf = dataUrlToBuffer(dataUrl);
                return { actualPng: decodePng(buf) };
              })();

              const { numDiffPixels: d } = diffCount(samplePng, png);
              if (d < tuneBest.numDiffPixels) {
                tuneBest = {
                  numDiffPixels: d,
                  glow: { sizePx, dy, opacityPct },
                  extrusionBlurPx: blurPx,
                };
              }
            }
          }
        }
      }

      console.log('TUNE_PRESET best:', tuneBest);
    }

    const actualOutPath = path.join(outDir, 'actual.png');
    const diffOutPath = path.join(outDir, 'diff.png');

    await writeFile(actualOutPath, best.actualBuf);
    await writeFile(diffOutPath, encodePng(best.diff));

    const total = samplePng.width * samplePng.height;
    const diffPct = ((numDiffPixels / total) * 100).toFixed(3);

    if (numDiffPixels > 0) {
      // Fail the test (non-zero exit code)
      console.error(
        `Visual mismatch: ${numDiffPixels} pixels differ (${diffPct}%). Best offset: (${best.offsetX}, ${best.offsetY}).`
      );
      console.error(`Wrote:`);
      console.error(`- ${actualOutPath}`);
      console.error(`- ${diffOutPath}`);
      process.exitCode = 1;
    } else {
      console.log('Visual match: 0 differing pixels.');
      console.log(`Wrote: ${actualOutPath}`);
    }
  } finally {
    await browser.close();
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
