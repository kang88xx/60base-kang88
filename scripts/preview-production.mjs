import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.argv[2] || 4411);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  const send = (status, headers, body) => response.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }).end(request.method === 'HEAD' ? undefined : body);
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (/^\/api(?:\/|$)/.test(url.pathname)) {
      // This local visual preview never sends mail or modifies real accounts.
      const readOnly = ['GET', 'HEAD'].includes(request.method) && /^\/api\/(?:session|health)\/?$/.test(url.pathname);
      return send(readOnly ? 200 : 503, { 'Content-Type': 'application/json' }, JSON.stringify(readOnly ? { online: false, user: null, csrf: null, configured: false } : { ok: false, error: 'preview_api_unavailable' }));
    }
    if (!['GET', 'HEAD'].includes(request.method)) return send(405, { Allow: 'GET, HEAD' });
    let relative = decodeURIComponent(url.pathname);
    if (relative.split('/').some(segment => segment.startsWith('.'))) return send(404, {}, 'Not found');
    if (relative === '/index.html') return send(307, { Location: '/' + url.search });
    if (relative === '/') relative = url.searchParams.get('lang') === 'ko' ? '/index.ko.html' : '/index.en.html';
    const filename = path.resolve(root, '.' + relative);
    if (!filename.startsWith(path.resolve(root) + path.sep)) return send(403, {}, 'Forbidden');
    const info = await stat(filename);
    if (info.isDirectory() && !url.pathname.endsWith('/')) return send(308, { Location: url.pathname + '/' + url.search });
    const asset = info.isDirectory() ? path.join(filename, 'index.html') : filename;
    const data = await readFile(asset);
    const headers = { 'Content-Type': types[path.extname(asset)] || 'application/octet-stream', 'Content-Length': data.length };
    if (asset.endsWith('sw.js')) headers['Service-Worker-Allowed'] = asset.includes(path.sep + 'app' + path.sep) ? '/app/' : '/';
    if (path.extname(asset) === '.mp4') {
      headers['Accept-Ranges'] = 'bytes';
      if (request.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
        const start = range ? Number(range[1]) : -1;
        const end = range?.[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
        if (start < 0 || start > end || start >= data.length) return send(416, { 'Content-Range': `bytes */${data.length}` });
        return send(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${data.length}` }, data.subarray(start, end + 1));
      }
    }
    return send(200, headers, data);
  } catch { return send(404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Production-build preview: http://127.0.0.1:${port}/ (EN) and /?lang=ko (KO)`));
