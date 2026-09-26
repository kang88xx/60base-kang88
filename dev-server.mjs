import http from 'node:http';
import contact from './api/contact.js';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEnglishHomepage } from './scripts/localize-homepage.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4317), host = process.env.HOST || '127.0.0.1';
const types = { '.pdf':'application/pdf', '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.mp4':'video/mp4', '.webmanifest':'application/manifest+json', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8' };
const server = http.createServer(async (request,response) => {
  try {
    if (new URL(request.url,`http://${request.headers.host}`).pathname.replace(/\/$/,'') === '/api/contact') { await contact(request,response); return; }
    if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405,{Allow:'GET, HEAD'}).end(); return; }
    const url = new URL(request.url,`http://${request.headers.host}`);
    if(['/api/session','/api/health'].includes(url.pathname.replace(/\/$/,''))){response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify({online:false,user:null,csrf:null,settings:{}}));return;}
    const relative = decodeURIComponent(url.pathname);
    if (relative.split('/').some(segment => segment.startsWith('.')) || !/^\/(?:$|index\.html$|styles\.css$|main\.js$|i18n\.js$|buyer-components\.(?:css|js)$|sw\.js$|previews\/(?:refinements|video-selector-20260914)\.html$|previews\/app-intro-motion(?:\/|$)|docs\/60BASE-Company-Profile-KO\.pdf$|studio(?:\/|$)|admin(?:\/|$)|app(?:\/|$)|shared\/|fonts\/|assets\/brand\/(?:opalhaus-20260914|60base-unified-20260914|60base-logo3-20260914)\/[^/]+\.(?:svg|png)$|assets\/opalhaus-requested\/[^/]+\.(?:css|js)$|assets\/opalhaus-promo\/(?:[^/]+\.(?:css|js)|media\/[^/]+\.(?:png|woff2)|android\/[^/]+\.svg)$|assets\/(?:icons|images|brand|social)\/[^/]+\.(?:svg|png|jpg|jpeg|webp)$|assets\/videos\/(?:motion-studies|live-action|collection|workflow)\/[^/]+\.(?:mp4|jpg|txt)$)/.test(relative)) { response.writeHead(404).end('Not found'); return; }
    let filename = path.resolve(root,`.${relative}`);
    if (filename !== root && !filename.startsWith(root+path.sep)) { response.writeHead(403).end(); return; }
    const info = await stat(filename);
    if (info.isDirectory()) { if (!url.pathname.endsWith('/')) { response.writeHead(302,{Location:`${url.pathname}/`}).end(); return; } filename = path.join(filename,'index.html'); }
    let content = await readFile(filename);
    if (filename === path.join(root, 'index.html')) {
      const selected = url.searchParams.get('lang');
      // A fresh homepage always starts in English; explicit language links still win.
      const language = selected === 'ko' ? 'ko' : 'en';
      if (language === 'en') content = Buffer.from(renderEnglishHomepage(content.toString('utf8')));
    }
    const headers = { 'Content-Type':types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' };
    if (filename.endsWith('sw.js')) headers['Service-Worker-Allowed'] = '/';
    if (filename.endsWith('.mp4')) {
      headers['Accept-Ranges'] = 'bytes';
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const start = match?.[1] ? Number(match[1]) : Math.max(0, content.length - Number(match?.[2]));
        const end = match?.[1] && match[2] ? Math.min(Number(match[2]), content.length - 1) : content.length - 1;
        if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || start > end || start >= content.length) {
          response.writeHead(416, { ...headers, 'Content-Range': `bytes */${content.length}` }).end(); return;
        }
        response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${content.length}`, 'Content-Length': end - start + 1 }).end(request.method === 'HEAD' ? undefined : content.subarray(start, end + 1)); return;
      }
    }
    headers['Content-Length'] = content.length;
    response.writeHead(200,headers).end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('페이지를 찾지 못했어요. /, /studio/, /app/ 주소를 확인해주세요.'); }
});
server.on('error',error => { console.error(error.code === 'EADDRINUSE' ? `포트 ${port}가 사용 중입니다. 실행 중인 미리보기를 열거나 PORT 값을 바꿔주세요.` : error.message); process.exitCode=1; });
server.listen(port,host,()=>console.log(`Koreo 회사: http://localhost:${port}/\n몸짓 웹: http://localhost:${port}/studio/\n몸짓 앱: http://localhost:${port}/app/\n종료: Ctrl+C · 서버/결제/외부 업로드 연결 없음`));
