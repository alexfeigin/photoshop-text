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

async function assertNoConsoleErrorsOnLoad(page, url) {
  const errors = [];

  page.on('pageerror', (err) => {
    errors.push({ kind: 'pageerror', message: String(err?.message || err), stack: String(err?.stack || '') });
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    errors.push({ kind: 'console.error', message: msg.text() });
  });

  await page.goto(url, { waitUntil: 'networkidle' });

  // Ensure core UI mounted.
  await page.waitForSelector('#textInput');
  await page.waitForSelector('#canvas');

  // Let any async init errors surface.
  await page.waitForTimeout(250);

  if (errors.length > 0) {
    const detail = errors
      .map((e) => {
        const stack = e.stack ? `\n${e.stack}` : '';
        return `- ${e.kind}: ${e.message}${stack}`;
      })
      .join('\n');
    throw new Error(`Console/page errors while loading ${url}:\n${detail}`);
  }
}

async function main() {
  const { url, close } = await serveStatic(projectRoot);
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

    await assertNoConsoleErrorsOnLoad(page, url);
    console.log('UI load (regular): PASS');

    await page.close();

    const page2 = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await assertNoConsoleErrorsOnLoad(page2, `${url}?expert=yes`);
    console.log('UI load (expert): PASS');

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
