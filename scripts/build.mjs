import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const allowedExtensions = new Set(['.html', '.css', '.js', '.svg', '.png', '.webmanifest']);
let count = 0;

async function copyAsset(relative) {
  const destination = path.join(output, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(root, relative), destination);
  count++;
}

async function copyDirectory(relative) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const asset = path.join(relative, entry.name);
    if (entry.isDirectory()) await copyDirectory(asset);
    else if (entry.isFile() && allowedExtensions.has(path.extname(entry.name))) await copyAsset(asset);
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const asset of ['index.html', 'styles.css', 'main.js', 'sw.js']) await copyAsset(asset);
for (const directory of ['studio', 'app', 'shared']) await copyDirectory(directory);
console.log(`Built ${count} public frontend assets in dist/`);
