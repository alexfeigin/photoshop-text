import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { serveStatic } from './helpers/serve-static.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function decodePng(buffer) {
  return PNG.sync.read(buffer);
}

function dataUrlToBuffer(dataUrl) {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) {
    throw new Error('Expected a PNG data URL');
  }
  return Buffer.from(dataUrl.slice(prefix.length), 'base64');
}

async function main() {
  const outDir = path.join(projectRoot, 'test-output');
  await mkdir(outDir, { recursive: true });

  const { url, close } = await serveStatic(projectRoot);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });

    async function render(opts) {
      const dataUrl = await page.evaluate(async (o) => {
        return await window.__renderTestPngDataUrl(o);
      }, opts);
      const buf = dataUrlToBuffer(dataUrl);
      return decodePng(buf);
    }

    const width = 980;
    const height = 240;

    const baseStops = [
      { offsetPct: 0, color: '#0000FF' },
      { offsetPct: 33, color: '#00FF00' },
      { offsetPct: 66, color: '#FFFF00' },
      { offsetPct: 100, color: '#FF00FF' },
    ];

    const layersBase = [
      {
        id: 'gradient_only',
        type: 'gradientFill',
        name: 'Gradient Fill',
        enabled: true,
        params: {
          stops: baseStops,
          angleDeg: 90,
        },
      },
    ];

    const layersChanged = [
      {
        id: 'gradient_only',
        type: 'gradientFill',
        name: 'Gradient Fill',
        enabled: true,
        params: {
          stops: [{ offsetPct: 0, color: '#FF0000' }, ...baseStops.slice(1)],
          angleDeg: 90,
        },
      },
    ];

    const imgA = await render({
      text: "LET'S CELEBRATE!",
      fontSize: 143,
      alignment: 'center',
      padding: 24,
      scale: 1,
      layers: layersBase,
      width,
      height,
      anchor: 'center',
      showBg: false,
      offsetX: 0,
      offsetY: 0,
    });

    const imgB = await render({
      text: "LET'S CELEBRATE!",
      fontSize: 143,
      alignment: 'center',
      padding: 24,
      scale: 1,
      layers: layersChanged,
      width,
      height,
      anchor: 'center',
      showBg: false,
      offsetX: 0,
      offsetY: 0,
    });

    if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
      throw new Error(`Size mismatch: A ${imgA.width}x${imgA.height}, B ${imgB.width}x${imgB.height}`);
    }

    const diff = new PNG({ width: imgA.width, height: imgA.height });
    const numDiffPixels = pixelmatch(imgA.data, imgB.data, diff.data, imgA.width, imgA.height, {
      threshold: 0.1,
      alpha: 0.8,
      includeAA: true,
    });

    if (numDiffPixels === 0) {
      const outA = path.join(outDir, 'gradient-stops-a.png');
      const outB = path.join(outDir, 'gradient-stops-b.png');
      const outDiff = path.join(outDir, 'gradient-stops-diff.png');
      await writeFile(outA, PNG.sync.write(imgA));
      await writeFile(outB, PNG.sync.write(imgB));
      await writeFile(outDiff, PNG.sync.write(diff));

      console.error('Gradient stops test failed: changing the 0% stop color produced no visual difference.');
      console.error(`Wrote:`);
      console.error(`- ${outA}`);
      console.error(`- ${outB}`);
      console.error(`- ${outDiff}`);
      process.exitCode = 1;
    } else {
      console.log(`Gradient stops test passed: ${numDiffPixels} pixels differ.`);
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
