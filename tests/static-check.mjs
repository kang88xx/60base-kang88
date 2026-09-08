import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO_ROOT = resolve(ROOT, '..');
const REVIEW_DIR = resolve(REPO_ROOT, process.env.KOREO_REVIEW_DIR || '.omx/reviews/base60-2026-09-08');
const results = [];
const allowedExternalHrefs = new Set([
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://fonts.googleapis.com/css2?family=Geist:wght@400;500&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+KR:wght@400;500&display=swap',
]);

function check(name, fn) {
  results.push({ name, fn, status: 'pending' });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function text(path) {
  return readFile(path, 'utf8');
}

function localPath(fromFile, ref) {
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean || clean.startsWith('data:')) return null;
  if (clean.startsWith('/')) return normalize(join(ROOT, clean));
  return normalize(join(dirname(fromFile), clean));
}

function assertInsideRoot(path, message) {
  assert(path.startsWith(ROOT), message);
}

async function collectFiles(dir, extensions, output = []) {
  const entries = await import('node:fs/promises').then((fs) => fs.readdir(dir, { withFileTypes: true }));
  for (const entry of entries) {
    if (entry.name.startsWith('._')) continue; // macOS AppleDouble metadata on external drives
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.')) await collectFiles(path, extensions, output);
    } else if (extensions.has(extname(entry.name))) {
      output.push(path);
    }
  }
  return output;
}

function extractAttributes(source, attribute) {
  const pattern = new RegExp(`(?<![-:\\w])${attribute}\\s*=\\s*["']([^"']+)["']`, 'gi');
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function pngDimensions(buffer) {
  const signature = '89504e470d0a1a0a';
  assert(buffer.subarray(0, 8).toString('hex') === signature, 'icon is not a PNG file');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

check('production JS and MJS parse with node --check', async () => {
  const files = await collectFiles(ROOT, new Set(['.js', '.mjs']));
  const production = files.filter((file) => !file.includes('/tests/'));
  for (const file of production) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert(result.status === 0, `${file} failed syntax check: ${result.stderr || result.stdout}`);
  }
});

check('HTML script, stylesheet, icon, anchor, image, and form references stay local and resolvable', async () => {
  const htmlFiles = await collectFiles(ROOT, new Set(['.html']));
  for (const file of htmlFiles) {
    const source = await text(file);
    for (const ref of extractAttributes(source, 'src')) {
      assert(!/^https?:\/\//i.test(ref), `${file} has external src: ${ref}`);
      assert(!/^mailto:/i.test(ref), `${file} has mailto src: ${ref}`);
      assert(!/^javascript:/i.test(ref), `${file} has javascript src: ${ref}`);
      assert(ref !== '#', `${file} has placeholder src="#"`);
      const path = localPath(file, ref);
      if (!path) continue;
      assertInsideRoot(path, `${file} references outside root: ${ref}`);
      assert(existsSync(path), `${file} references missing file: ${ref}`);
    }
    for (const ref of extractAttributes(source, 'href')) {
        if (ref.startsWith('#')) continue;
        if (/^https?:\/\//i.test(ref)) {
          assert(allowedExternalHrefs.has(ref), `${file} has unknown external href: ${ref}`);
          continue;
        }
        assert(!/^mailto:/i.test(ref), `${file} has mailto link: ${ref}`);
        assert(!/^javascript:/i.test(ref), `${file} has javascript link: ${ref}`);
        assert(ref !== '#', `${file} has placeholder href="#"`);
        const path = localPath(file, ref);
        if (!path) continue;
        assertInsideRoot(path, `${file} references outside root: ${ref}`);
        assert(existsSync(path), `${file} references missing file: ${ref}`);
    }
    for (const action of extractAttributes(source, 'action')) {
      assert(!/^https?:\/\//i.test(action), `${file} has external form action: ${action}`);
      assert(!/^mailto:/i.test(action), `${file} has mailto form action: ${action}`);
      const path = localPath(file, action);
      if (path) {
        assertInsideRoot(path, `${file} form action escapes root: ${action}`);
        assert(existsSync(path), `${file} form action missing target: ${action}`);
      }
    }
  }
});

check('CSS url() references stay local and resolvable', async () => {
  const cssFiles = await collectFiles(ROOT, new Set(['.css']));
  for (const file of cssFiles) {
    const source = await text(file);
    const urls = [...source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((match) => match[1]);
    for (const ref of urls) {
      if (/^(data:|#)/i.test(ref)) continue;
      assert(!/^https?:\/\//i.test(ref), `${file} has external CSS url: ${ref}`);
      const path = localPath(file, ref);
      if (!path) continue;
      assertInsideRoot(path, `${file} CSS url escapes root: ${ref}`);
      assert(existsSync(path), `${file} CSS url missing file: ${ref}`);
    }
  }
});

check('manifest icons exist and declared PNG dimensions match files', async () => {
  const manifestPath = resolve(ROOT, 'app/manifest.webmanifest');
  const manifest = JSON.parse(await text(manifestPath));
  assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest has no icons');
  for (const icon of manifest.icons) {
    assert(icon.src, 'manifest icon is missing src');
    const path = localPath(manifestPath, icon.src);
    assert(path, `manifest icon has unsupported src: ${icon.src}`);
    assertInsideRoot(path, `manifest icon escapes root: ${icon.src}`);
    const info = await stat(path);
    assert(info.isFile(), `manifest icon missing file: ${icon.src}`);
    if (extname(path).toLowerCase() === '.png') {
      const buffer = await readFile(path);
      const dimensions = pngDimensions(buffer);
      assert(
        icon.sizes === `${dimensions.width}x${dimensions.height}`,
        `manifest icon ${icon.src} declares ${icon.sizes} but file is ${dimensions.width}x${dimensions.height}`,
      );
    }
  }
});

check('service worker cache manifest references existing local files', async () => {
  const swPath = resolve(ROOT, 'sw.js');
  const source = await text(swPath);
  const shellMatch = source.match(/const\s+SHELL\s*=\s*\[([\s\S]*?)\];/);
  assert(shellMatch, 'sw.js SHELL array not found');
  const refs = [...shellMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
  assert(refs.length > 0, 'sw.js SHELL array is empty');
  for (const ref of refs) {
    const path = localPath(swPath, ref.endsWith('/') ? `${ref}index.html` : ref);
    assert(path, `sw.js has unsupported shell ref: ${ref}`);
    assertInsideRoot(path, `sw.js shell ref escapes root: ${ref}`);
    assert(existsSync(path), `sw.js shell ref missing file: ${ref}`);
  }
});

async function run() {
  await mkdir(REVIEW_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  for (const entry of results) {
    const start = Date.now();
    try {
      await entry.fn();
      entry.status = 'passed';
    } catch (error) {
      entry.status = 'failed';
      entry.error = error?.stack || String(error);
    } finally {
      entry.durationMs = Date.now() - start;
      delete entry.fn;
    }
  }
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    summary: {
      passed: results.filter((result) => result.status === 'passed').length,
      failed: results.filter((result) => result.status === 'failed').length,
    },
    results,
  };
  await writeFile(resolve(REVIEW_DIR, 'test-static-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.summary.failed) process.exitCode = 1;
}

run().catch(async (error) => {
  const report = {
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    summary: { passed: 0, failed: 1 },
    results: [{ name: 'runner startup', status: 'failed', error: error?.stack || String(error) }],
  };
  await mkdir(REVIEW_DIR, { recursive: true }).catch(() => null);
  await writeFile(resolve(REVIEW_DIR, 'test-static-report.json'), `${JSON.stringify(report, null, 2)}\n`).catch(() => null);
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
