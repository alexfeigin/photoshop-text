import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { chromium } from 'playwright';

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
    } catch {
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

function assertContained(inner, outer, epsilonPx, label) {
  const eps = Number(epsilonPx) || 0;

  if (inner.left < outer.left - eps) {
    throw new Error(`${label}: left clipped (inner.left=${inner.left}, outer.left=${outer.left})`);
  }
  if (inner.top < outer.top - eps) {
    throw new Error(`${label}: top clipped (inner.top=${inner.top}, outer.top=${outer.top})`);
  }
  if (inner.right > outer.right + eps) {
    throw new Error(`${label}: right clipped (inner.right=${inner.right}, outer.right=${outer.right})`);
  }
  if (inner.bottom > outer.bottom + eps) {
    throw new Error(`${label}: bottom clipped (inner.bottom=${inner.bottom}, outer.bottom=${outer.bottom})`);
  }
}

function assertPixelBoundsNotClipped(bounds, canvasSize, label) {
  const { w, h } = canvasSize;
  const { minX, minY, maxX, maxY } = bounds;

  // True clipping signal: rendered pixels exist on the outermost edge.
  if (minX === 0) throw new Error(`${label}: pixels clipped on left edge (minX=0)`);
  if (minY === 0) throw new Error(`${label}: pixels clipped on top edge (minY=0)`);
  if (maxX === w - 1) throw new Error(`${label}: pixels clipped on right edge (maxX=${maxX}, w=${w})`);
  if (maxY === h - 1) throw new Error(`${label}: pixels clipped on bottom edge (maxY=${maxY}, h=${h})`);
}

const LONG_TEXT = `this is more text this is more text this is more text this is more text this is more text
this is more text this is more text this is more text this is more text this is more text
this is more text this is more text this is more text this is more text this is more text
this is more text this is more text this is more text this is more text this is more text`;

async function assertPreviewFits(page, url, label) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#textInput');
  await page.waitForSelector('#arcPct');
  await page.waitForSelector('#preview');
  await page.waitForSelector('#canvas');

  await page.fill('#textInput', LONG_TEXT);

  // Set arcPct to 100 and trigger render.
  await page.evaluate(() => {
    const el = document.getElementById('arcPct');
    el.value = '100';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Allow render + fit-to-preview transform to apply.
  await page.waitForTimeout(250);

  // Ensure the actual rendered pixels are not clipped inside the canvas.
  // This catches the real bug: arc warping requiring extra output height.
  const pixel = await page.evaluate(() => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2d context');

    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = d[(y * w + x) * 4 + 3];
        if (a === 0) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < 0 || maxY < 0) {
      throw new Error('No non-transparent pixels found on canvas');
    }

    return { w, h, minX, minY, maxX, maxY };
  });

  assertPixelBoundsNotClipped(
    { minX: pixel.minX, minY: pixel.minY, maxX: pixel.maxX, maxY: pixel.maxY },
    { w: pixel.w, h: pixel.h },
    label
  );

  const rects = await page.evaluate(() => {
    const preview = document.getElementById('preview');
    const canvas = document.getElementById('canvas');
    const pr = preview.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const cs = getComputedStyle(preview);
    const padL = Number.parseFloat(cs.paddingLeft) || 0;
    const padR = Number.parseFloat(cs.paddingRight) || 0;
    const padT = Number.parseFloat(cs.paddingTop) || 0;
    const padB = Number.parseFloat(cs.paddingBottom) || 0;

    const inner = {
      left: pr.left + padL,
      top: pr.top + padT,
      right: pr.right - padR,
      bottom: pr.bottom - padB,
    };

    return { inner, canvas: { left: cr.left, top: cr.top, right: cr.right, bottom: cr.bottom } };
  });

  assertContained(rects.canvas, rects.inner, 1.5, label);
}

async function main() {
  const { url, close } = await serveStatic(projectRoot);
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await assertPreviewFits(page, url, 'Preview fit (regular)');
    console.log('Preview fit (regular): PASS');
    await page.close();

    const page2 = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await assertPreviewFits(page2, `${url}?expert=yes`, 'Preview fit (expert)');
    console.log('Preview fit (expert): PASS');
    await page2.close();
  } finally {
    await browser.close();
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
