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

function expectNear(a, b, tolerance, msg) {
  const d = Math.abs(a - b);
  if (d > tolerance) {
    throw new Error(`${msg} (diff=${d}, tolerance=${tolerance})`);
  }
}

async function main() {
  const { url, close } = await serveStatic(projectRoot);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });

    // Create enough layers to make the left panel scroll.
    await page.waitForSelector('#addLayerBtn');
    for (let i = 0; i < 30; i++) {
      await page.click('#addLayerBtn');
    }

    await page.waitForTimeout(100);

    const before = await page.evaluate(() => {
      const panel = document.querySelector('.panel');
      const previewWrap = document.querySelector('.previewWrap');
      const vr = previewWrap.getBoundingClientRect();
      return {
        panelScrollTop: panel.scrollTop,
        previewTop: vr.top,
        previewBottom: vr.bottom,
        previewCenterY: (vr.top + vr.bottom) / 2,
        viewportH: window.innerHeight,
      };
    });

    // Scroll the left panel deeply.
    await page.evaluate(() => {
      const panel = document.querySelector('.panel');
      panel.scrollTop = panel.scrollHeight;
    });

    await page.waitForTimeout(200);

    const after = await page.evaluate(() => {
      const panel = document.querySelector('.panel');
      const previewWrap = document.querySelector('.previewWrap');
      const vr = previewWrap.getBoundingClientRect();
      return {
        panelScrollTop: panel.scrollTop,
        previewTop: vr.top,
        previewBottom: vr.bottom,
        previewCenterY: (vr.top + vr.bottom) / 2,
        viewportH: window.innerHeight,
      };
    });

    // Must actually have scrolled.
    if (!(after.panelScrollTop > before.panelScrollTop)) {
      throw new Error('Expected left panel to scroll, but scrollTop did not increase.');
    }

    // Preview should remain within viewport.
    if (after.previewTop < -1 || after.previewBottom > after.viewportH + 1) {
      throw new Error(
        `Expected preview to remain within viewport; got top=${after.previewTop}, bottom=${after.previewBottom}, viewportH=${after.viewportH}`
      );
    }

    // Preview should remain centered-ish.
    const expectedCenter = after.viewportH / 2;
    expectNear(after.previewCenterY, expectedCenter, 30, 'Expected preview to stay vertically centered');

    console.log('Layout sticky preview: PASS');
  } finally {
    await browser.close();
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
