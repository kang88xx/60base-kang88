import { copyFile, mkdir, readdir, readFile, writeFile, realpath, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const prototype = await realpath(path.resolve(process.argv[2] || path.join(root, '../60base-loco-20261009')));
const homepage = path.join(root, 'homepage');
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.css', '.json', '.svg']);
const assetExtensions = new Set(['.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.woff2', '.ico', '.txt', '.json']);
let count = 0;

async function copyTree(source, destination, extensions) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (from.replaceAll('\\', '/').endsWith('/public/assets/media/service-reference/source-frames.json')) continue;
    if (entry.isDirectory()) await copyTree(from, to, extensions);
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) { await copyFile(from, to); count++; }
  }
}

await mkdir(homepage, { recursive: true });
for (const name of ['src', 'public']) {
  const target = path.resolve(homepage, name);
  // Cleanup is limited to the two generated copies inside this checkout.
  if (path.dirname(target) !== homepage || !target.startsWith(root + path.sep)) throw new Error('Unsafe sync target.');
  const info = await lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (info?.isSymbolicLink()) throw new Error('Refusing to replace a linked sync target.');
  await rm(target, { recursive: true, force: true });
}
await copyTree(path.join(prototype, 'src'), path.join(homepage, 'src'), sourceExtensions);
await copyTree(path.join(prototype, 'public/assets'), path.join(homepage, 'public/assets'), assetExtensions);
for (const entry of await readdir(path.join(prototype, 'public'), { withFileTypes: true })) {
  if (entry.isFile() && /^favicon(?:-\d+)?\.(?:ico|svg|png)$/.test(entry.name)) {
    await copyFile(path.join(prototype, 'public', entry.name), path.join(homepage, 'public', entry.name)); count++;
  }
}
await copyFile(path.join(prototype, 'index.html'), path.join(homepage, 'index.html'));
const frameProvenance = await readFile(path.join(prototype, 'public/assets/media/service-reference/source-frames.json')).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (frameProvenance) {
  await mkdir(path.join(root, 'docs/operations'), { recursive: true });
  await writeFile(path.join(root, 'docs/operations/SERVICE-FRAME-SOURCES-20261010.json'), frameProvenance);
}
const contactTests = await readFile(path.join(prototype, 'tests/contact-form.test.mjs'), 'utf8').catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (contactTests) {
  await writeFile(path.join(root, 'tests/homepage-contact.test.mjs'), contactTests.replace('../src/useContactForm.js', '../homepage/src/useContactForm.js'));
  count++;
}
console.log(`Synchronized ${count + 1} homepage source/asset files from ${prototype}`);
console.log('Excluded design-options, screenshots, evidence, Figma handoff, build output and local dependencies.');
