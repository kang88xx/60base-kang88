import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Production serves the console from Vercel and proxies /api to the operations backend on the same origin.
// Browser tests do the same: this repo's static files plus a pass-through /api proxy to a backend listening on
// backendPort, so cookies, CSRF and Origin behave as deployed.
const repo = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

export async function serveConsole({ port, backendPort }) {
  const base = `http://127.0.0.1:${port}`;
  const proxy = http.createServer(async (req, res) => {
    const url = new URL(req.url, base);
    if (url.pathname.startsWith('/api/')) {
      const upstream = http.request({ host: '127.0.0.1', port: backendPort, method: req.method, path: req.url, headers: req.headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(upstream); return;
    }
    let relative = decodeURIComponent(url.pathname); if (relative.endsWith('/')) relative += 'index.html';
    const file = path.resolve(repo, '.' + relative);
    if (!/^\/(?:admin|studio|shared|app|assets|fonts)\//.test(relative) || relative.split('/').some(part => part.startsWith('.')) || !file.startsWith(repo + path.sep)) { res.writeHead(404).end(); return; }
    try { const content = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(content); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => proxy.listen(port, '127.0.0.1', resolve));
  return { base, close: () => new Promise(resolve => proxy.close(resolve)) };
}
