import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const publicExtensions = new Set(['.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webmanifest', '.woff2', '.txt']);
const hash = data => createHash('sha256').update(data).digest('hex');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter(entry => !entry.name.startsWith('.')).map(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : [filename];
  }));
  return nested.flat();
}

test('default EN and explicit KO keep production SEO and resolve compiled assets', async () => {
  for (const language of ['en', 'ko']) {
    const html = await readFile(path.join(output, `index.${language}.html`), 'utf8');
    assert.match(html, new RegExp(`<html\\b[^>]*lang="${language}"`));
    assert.match(html, /rel="canonical" href="https:\/\/60base\.ai\/"/);
    assert.match(html, /property="og:image" content="https:\/\/60base\.ai\/homepage\/assets\/brand\/social-homepage\.png"/);
    assert.match(html, /name="twitter:image" content="https:\/\/60base\.ai\/homepage\/assets\/brand\/social-homepage\.png"/);
    assert.match(html, /property="og:image:width" content="1200"/);
    assert.match(html, /property="og:image:height" content="630"/);
    assert.match(html, /property="og:image:alt" content="[^"]*HUMAN ACTIONS\. DATA FOR PHYSICAL AI\./);
    assert.match(html, /name="twitter:card"/);
    assert.doesNotMatch(html, /noindex|Homepage design preview|homepage design preview|\/src\/main\.jsx/i);
    const assets = [...html.matchAll(/(?:src|href)=["'](\/homepage\/[^"']+)["']/g)].map(match => match[1]);
    assert.ok(assets.some(asset => asset.endsWith('.js')), 'Compiled JavaScript is missing.');
    assert.ok(assets.some(asset => asset.endsWith('.css')), 'Compiled CSS is missing.');
    for (const asset of assets) assert.ok((await stat(path.join(output, asset))).isFile(), `Missing ${asset}`);
  }
  const socialImage = await readFile(path.join(output, 'homepage/assets/brand/social-homepage.png'));
  assert.equal(socialImage.toString('hex', 0, 8), '89504e470d0a1a0a', 'The shared thumbnail must be a PNG.');
  assert.equal(socialImage.readUInt32BE(16), 1200);
  assert.equal(socialImage.readUInt32BE(20), 630);
  assert.deepEqual(await readFile(path.join(output, 'index.html')), await readFile(path.join(output, 'index.en.html')));
});

test('homepage public assets are complete and stay in their own namespace', async () => {
  for (const file of await files(path.join(root, 'homepage/public'))) {
    const relative = path.relative(path.join(root, 'homepage/public'), file);
    assert.deepEqual(await readFile(path.join(output, 'homepage', relative)), await readFile(file), relative);
  }
  await assert.rejects(stat(path.join(output, 'homepage/design-options')), { code: 'ENOENT' });
});

test('Studio, administrator, app and shared public files survive the build unchanged', async () => {
  for (const directory of ['studio', 'admin', 'app', 'shared', 'fonts', 'assets']) {
    for (const file of await files(path.join(root, directory))) {
      const relative = path.relative(root, file);
      if (!publicExtensions.has(path.extname(file))) continue;
      if (relative.replaceAll('\\', '/') === 'studio/firebase-config.js') continue; // Vercel injects public project identifiers.
      assert.deepEqual(await readFile(path.join(output, relative)), await readFile(file), relative);
    }
  }
});

test('production behavior stays byte exact apart from reviewed EGO brand substitutions', async () => {
  const record = JSON.parse(await readFile(path.join(root, 'docs/operations/PRODUCTION-PRESERVATION-20261009.json'), 'utf8'));
  const branding = JSON.parse(await readFile(path.join(root, 'docs/operations/EGO-BRAND-PRESERVATION-20261011.json'), 'utf8'));
  for (const file of record.files) {
    let source = await readFile(path.join(root, file.file), 'utf8');
    const changes = branding.files.find(change => change.file === file.file)?.replacements || [];
    for (const { before, after } of [...changes].reverse()) {
      assert.equal(source.split(after).length - 1, 1, `Expected exact reviewed branding in ${file.file}`);
      source = source.replace(after, before);
    }
    assert.equal(hash(source), file.productionSha256, file.file);
  }
  for (const file of record.protectedSourceFiles) {
    const source = await readFile(path.join(root, file.file));
    const portable = file.normalization === 'LF' ? source.toString('utf8').replaceAll('\r\n', '\n') : source;
    assert.equal(hash(portable), file.sha256, file.file);
  }
});
