import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { chromium } from 'playwright';
import { serveStatic } from './helpers/serve-static.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

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
