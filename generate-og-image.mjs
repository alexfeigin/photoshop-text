import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const width = 1200;
const height = 630;

const rootDir = process.cwd();
const svgPath = path.join(rootDir, 'og-image.svg');
const outPath = path.join(rootDir, 'og-image.png');

const svgUrl = pathToFileURL(svgPath).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

await page.goto(svgUrl, { waitUntil: 'networkidle' });
await page.setViewportSize({ width, height });
await page.waitForTimeout(100);

await page.screenshot({ path: outPath, type: 'png' });

await browser.close();
console.log(`Wrote ${outPath}`);
