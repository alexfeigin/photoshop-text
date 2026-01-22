import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function serveStatic(rootDir) {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = (req.url || '/').split('?')[0];
      const safePath = urlPath === '/' ? '/index.html' : urlPath;
      const resolved = path.resolve(rootDir, '.' + safePath);

      if (!resolved.startsWith(rootDir)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      const data = await readFile(resolved);

      const ext = path.extname(resolved).toLowerCase();
      const contentType =
        ext === '.html'
          ? 'text/html; charset=utf-8'
          : ext === '.js'
            ? 'text/javascript; charset=utf-8'
            : ext === '.css'
              ? 'text/css; charset=utf-8'
              : ext === '.png'
                ? 'image/png'
                : ext === '.otf'
                  ? 'font/otf'
                  : 'application/octet-stream';

      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.end(data);
    } catch (e) {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

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

async function main() {
  const outDir = path.join(projectRoot, 'test-output');
  await mkdir(outDir, { recursive: true });

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
    await page.goto(url, { waitUntil: 'networkidle' });

    async function renderActualPng(offsetX, offsetY) {
      const dataUrl = await page.evaluate(async (opts) => {
        return await window.__renderTestPngDataUrl(opts);
      }, {
        text: "LET'S CELEBRATE!",
        fontSize: 143,
        alignment: 'center',
        padding: 24,
        scale: 1,
        layers: [
          {
            id: 'outerGlow_cloud',
            type: 'outerGlow',
            name: 'Outer Glow (cloud)',
            enabled: true,
            params: {
              color: '#1A0024',
              opacityPct: 62,
              sizePx: 40,
              dx: 0,
              dy: 8,
            },
          },
          {
            id: 'mkpagc4j_opor3b',
            type: 'extrusion',
            name: 'Extrusion',
            enabled: true,
            params: {
              color: '#3c024b',
              opacityPct: 96,
              steps: 6,
              dx: 0,
              dy: 3,
              blurPx: 2,
            },
          },
          {
            id: 'extrusion_002',
            type: 'extrusion',
            name: 'Extrusion (orange)',
            enabled: true,
            params: {
              color: '#DE5221',
              opacityPct: 96,
              steps: 1,
              dx: 0,
              dy: 9,
              blurPx: 0,
            },
          },
          {
            id: 'base_fill',
            type: 'gradientFill',
            name: 'Gradient Fill',
            enabled: true,
            params: {
              stops: [
                { offsetPct: 0, color: '#FFDA18' },
                { offsetPct: 35, color: '#FFCF15' },
                { offsetPct: 52, color: '#FFC411' },
                { offsetPct: 70, color: '#FFA507' },
                { offsetPct: 84, color: '#FFA105' },
                { offsetPct: 100, color: '#FF9D03' },
              ],
              angleDeg: 90,
            },
          },
        ],
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
