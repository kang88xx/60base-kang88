import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderEnglishHomepage } from './localize-homepage.mjs';
import { buildHomepage } from './build-homepage.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const allowedExtensions = new Set(['.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webmanifest', '.woff2', '.txt']);
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
// Both static locales share the source; Vercel routes select the requested variant.
const homepage = await readFile(path.join(root, 'index.html'), 'utf8');
await writeFile(path.join(output, 'index.ko.html'), homepage);
await writeFile(path.join(output, 'index.en.html'), renderEnglishHomepage(homepage));
count += 2;
for (const asset of ['styles.css', 'i18n.js', 'main.js', 'buyer-components.css', 'buyer-components.js', 'sw.js', 'previews/refinements.html']) await copyAsset(asset);
for (const directory of ['studio', 'admin', 'app', 'shared', 'fonts', 'assets']) await copyDirectory(directory);
// Publish the requested motion comparison without changing the app launch flow.
await copyDirectory('previews/app-intro-motion');
// Only Firebase's public web identifiers enter the client build.
const firebaseConfig = {
  apiKey: process.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.PUBLIC_FIREBASE_APP_ID,
};
if (Object.values(firebaseConfig).some(Boolean)) {
  if (!Object.values(firebaseConfig).every(value => typeof value === 'string' && value.trim())) {
    throw new Error('Set all four PUBLIC_FIREBASE_* web configuration variables before deploying signup.');
  }
  if (!/^[a-z0-9][a-z0-9-]+$/.test(firebaseConfig.projectId) ||
      !/^[a-z0-9.-]+$/.test(firebaseConfig.authDomain)) throw new Error('Invalid Firebase web project/domain.');
  await writeFile(path.join(output, 'studio/firebase-config.js'), `export const firebaseConfig = ${JSON.stringify(firebaseConfig)};\n`);
}
await copyAsset('studio/service-status.json');
// Publish only this reviewed document; other local documents stay private.
await copyAsset('docs/60BASE-Company-Profile-KO.pdf');
console.log(`Built ${count} public frontend assets in dist/`);
await buildHomepage(output);
