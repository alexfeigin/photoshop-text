import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  const pkgPath = path.join(projectRoot, 'package.json');
  const raw = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

  const outDir = path.join(projectRoot, 'src');
  await mkdir(outDir, { recursive: true });

  const outPath = path.join(outDir, 'version.js');
  const content = `export const APP_VERSION = ${JSON.stringify(version)};\n`;
  await writeFile(outPath, content, 'utf8');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
