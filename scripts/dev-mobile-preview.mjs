import { createServer } from 'vite';
import { readFile, stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFile } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const previewFile = new URL('../tools/mobile-preview.html', import.meta.url);
const requestedPort = process.argv.find(value => value.startsWith('--port='))?.slice(7);
const port = Number(requestedPort || 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port.');
const previewUrl = `http://127.0.0.1:${port}/__mobile/`;
const publicDirectories = ['app', 'studio', 'shared', 'assets', 'fonts'];
const publicRoots = publicDirectories.map(directory => path.join(root, directory) + path.sep);
// Only the generated participant web bundle is exposed, never its private repo.
const iosRoot = path.resolve(root, '../../mobile_worktrees/ego-brand-20261011/mobile/www');
const iosDirectories = [...publicDirectories, 'vendor'];
const iosPublicRoots = iosDirectories.map(directory => path.join(iosRoot, directory) + path.sep);
const watchedRoots = [...publicRoots, ...iosPublicRoots];
const iosAssetPaths = text => text.replace(/(["'`(])\/(app|studio|shared|assets|fonts|vendor)(?=[/"'`)]|$)/g, '$1/__ios/$2');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.webmanifest': 'application/manifest+json', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const reloadScript = `if (parent === window) {
  const changes = new EventSource('/__mobile/events');
  const target = location.pathname.startsWith('/__ios/') ? 'ios' : 'app';
  changes.addEventListener('reload', event => { if (event.data === target) location.reload(); });
  addEventListener('pagehide', () => changes.close());
}`;
// Development only: never install the app's cache-first production worker here.
const developmentWorker = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.registration.unregister()));`;
console.log('Starting mobile preview');

const existing = await fetch(previewUrl, { signal: AbortSignal.timeout(1200) }).catch(() => null);
if (existing?.ok && existing.headers.get('X-60base-preview') === 'mobile-dev') {
  console.log(`Mobile preview: ${previewUrl} (already running)`);
  if (process.argv.includes('--open')) {
    const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', previewUrl] : [previewUrl];
    execFile(command, args, { windowsHide: true }, error => { if (error) console.error(`Open ${previewUrl} in your browser.`); });
  }
} else {
  const clients = new Set();
  const reloadTimers = new Map();
  const generations = { app: 0, ios: 0 };
  async function iosBundleReady() {
    // The iOS builder replaces www, then writes the branded index as its last step.
    // Wait for that completed entry and essential assets before reloading a view.
    const required = ['app/app.js', 'app/native.js', 'app/ego-brand.css', 'app/icons/ego-icon-512.png', 'studio/online-api.js', 'studio/cloud-account.js', 'shared/base.css', 'vendor/firebase-app.js'];
    try {
      const entry = await readFile(path.join(iosRoot, 'app/index.html'), 'utf8');
      if (!entry.includes('href="ego-brand.css"') || !entry.includes('</html>')) return false;
      return (await Promise.all(required.map(file => stat(path.join(iosRoot, file))))).every(info => info.isFile() && info.size > 0);
    } catch { return false; }
  }
  function scheduleReload(target, generation, delay) {
    clearTimeout(reloadTimers.get(target));
    reloadTimers.set(target, setTimeout(async () => {
      if (generations[target] !== generation) return;
      if (target === 'ios' && !await iosBundleReady()) {
        if (generations[target] === generation) scheduleReload(target, generation, 500);
        return;
      }
      if (generations[target] !== generation) return;
      for (const client of clients) client.write(`event: reload\ndata: ${target}\n\n`);
    }, delay));
  }
  const server = await createServer({
    configFile: fileURLToPath(new URL('../homepage/vite.config.mjs', import.meta.url)),
    server: {
      host: '127.0.0.1', port, strictPort: true,
      // This workspace lives on J:, where filesystem change events can be missed.
      watch: { usePolling: true, interval: 250 },
      open: process.argv.includes('--open') ? '/__mobile/' : false,
    },
    plugins: [{
      name: 'local-mobile-preview',
      configureServer(vite) {
        vite.watcher.add(watchedRoots);
        vite.watcher.on('all', (event, filename) => {
          if (!['add', 'change', 'unlink'].includes(event) || !watchedRoots.some(directory => path.resolve(filename).startsWith(directory))) return;
          const target = iosPublicRoots.some(directory => path.resolve(filename).startsWith(directory)) ? 'ios' : 'app';
          scheduleReload(target, ++generations[target], target === 'ios' ? 700 : 200);
        });
        vite.middlewares.use(async (request, response, next) => {
          const send = (status, type, data, extra = {}) => {
            response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
            response.end(request.method === 'HEAD' ? undefined : data);
          };
          try {
            const url = new URL(request.url, previewUrl);
            const isIos = url.pathname === '/__ios' || url.pathname.startsWith('/__ios/');
            const assetPath = isIos ? url.pathname.slice('/__ios'.length) : url.pathname;
            if (assetPath === '/api' || assetPath.startsWith('/api/')) {
              return send(503, 'application/json', JSON.stringify({ ok: false, error: '로컬 미리보기에서는 계정·서버 기능을 연결하지 않습니다. 운영 앱에서 확인해주세요.' }));
            }
            const isStatic = (isIos ? iosDirectories : publicDirectories).some(directory => assetPath === '/' + directory || assetPath.startsWith('/' + directory + '/'));
            const isPreview = url.pathname === '/__mobile' || url.pathname.startsWith('/__mobile/');
            if (!isStatic && !isPreview) return isIos ? send(404, 'text/plain', 'Not found') : next();
            if (!['GET', 'HEAD'].includes(request.method)) return send(405, 'text/plain', 'Method not allowed', { Allow: 'GET, HEAD' });
            if (url.pathname === '/__mobile/events') {
              if (request.method === 'HEAD') return send(200, 'text/event-stream', '');
              response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
              response.write(': connected\n\n');
              clients.add(response);
              request.on('close', () => clients.delete(response));
              return;
            }
            if (url.pathname === '/__mobile/reload.js') return send(200, types['.js'], reloadScript);
            if (url.pathname === '/__mobile/' || url.pathname === '/__mobile') {
              return send(200, types['.html'], await readFile(previewFile), { 'X-60base-preview': 'mobile-dev' });
            }
            if (isPreview) return send(404, 'text/plain', 'Not found');
            const relative = decodeURIComponent(assetPath);
            if (relative.includes('\\') || relative.split('/').some(segment => segment.startsWith('.'))) return send(404, 'text/plain', 'Not found');
            let filename = path.resolve(isIos ? iosRoot : root, '.' + relative);
            const publicRoot = (isIos ? iosPublicRoots : publicRoots).find(directory => filename === directory.slice(0, -1) || filename.startsWith(directory));
            if (!publicRoot) return send(404, 'text/plain', 'Not found');
            if (relative === '/app/sw.js') return send(200, types['.js'], developmentWorker, { 'Service-Worker-Allowed': isIos ? '/__ios/app/' : '/app/' });
            // Keep both local variants independent from real Firebase accounts.
            if (relative === '/studio/firebase-config.js') return send(200, types['.js'], 'export const firebaseConfig = null;\n');
            let info = await stat(filename);
            if (info.isDirectory()) {
              if (!url.pathname.endsWith('/')) return send(307, 'text/plain', '', { Location: url.pathname + '/' + url.search });
              filename = path.join(filename, 'index.html');
              info = await stat(filename);
            }
            const actual = await realpath(filename);
            if (!actual.startsWith(publicRoot)) return send(404, 'text/plain', 'Not found');
            const extension = path.extname(filename).toLowerCase();
            const type = types[extension] || (relative === '/studio/service-status.json' ? 'application/json' : null);
            if (!type || !info.isFile()) return send(404, 'text/plain', 'Not found');
            if (extension === '.html') {
              let html = await readFile(filename, 'utf8');
              if (isIos) html = iosAssetPaths(html);
              html = html.replace('</head>', '<script src="/__mobile/reload.js"></script></head>');
              return send(200, type, html);
            }
            if (isIos && ['.js', '.css', '.webmanifest'].includes(extension)) return send(200, type, iosAssetPaths(await readFile(filename, 'utf8')));
            let start = 0, end = info.size - 1, status = 200;
            const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
            if (request.headers.range) {
              const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
              start = range?.[1] ? Number(range[1]) : Math.max(0, info.size - Number(range?.[2]));
              end = range?.[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
              if (!range || (!range[1] && !range[2]) || !Number.isSafeInteger(start) || start > end || start >= info.size) return send(416, 'text/plain', '', { 'Content-Range': `bytes */${info.size}` });
              status = 206;
              headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
            }
            headers['Content-Length'] = Math.max(0, end - start + 1);
            response.writeHead(status, headers);
            if (request.method === 'HEAD' || info.size === 0) return response.end();
            const stream = createReadStream(filename, { start, end });
            stream.on('error', error => response.destroy(error));
            response.on('close', () => stream.destroy());
            stream.pipe(response);
          } catch (error) {
            if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error instanceof URIError) return send(404, 'text/plain', 'Not found');
            next(error);
          }
        });
      },
    }],
  });
  await server.listen();
  console.log(`Mobile preview: ${previewUrl}`);
  console.log('App: edit app/ (plus studio/ and shared/). Saved changes reload the local app.');
  console.log('Local API and Firebase accounts are disconnected. Production app is a separate preview option. Ctrl+C to stop.');
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      for (const timer of reloadTimers.values()) clearTimeout(timer);
      for (const client of clients) client.end();
      await server.close();
      process.exit(0);
    });
  }
}

