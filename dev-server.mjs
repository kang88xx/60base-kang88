import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4317), host = process.env.HOST || '127.0.0.1';
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = http.createServer(async (request,response) => {
  try {
    if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405,{Allow:'GET, HEAD'}).end(); return; }
    const url = new URL(request.url,`http://${request.headers.host}`);
    const relative = decodeURIComponent(url.pathname);
    if (relative.split('/').some(segment => segment.startsWith('.')) || !/^\/(?:$|index\.html$|styles\.css$|main\.js$|sw\.js$|studio(?:\/|$)|app(?:\/|$)|shared\/)/.test(relative)) { response.writeHead(404).end('Not found'); return; }
    let filename = path.resolve(root,`.${relative}`);
    if (filename !== root && !filename.startsWith(root+path.sep)) { response.writeHead(403).end(); return; }
    const info = await stat(filename);
    if (info.isDirectory()) { if (!url.pathname.endsWith('/')) { response.writeHead(302,{Location:`${url.pathname}/`}).end(); return; } filename = path.join(filename,'index.html'); }
    const content = await readFile(filename);
    const headers = { 'Content-Type':types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' };
    if (filename.endsWith('sw.js')) headers['Service-Worker-Allowed'] = '/';
    response.writeHead(200,headers).end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('페이지를 찾지 못했어요. /, /studio/, /app/ 주소를 확인해주세요.'); }
});
server.on('error',error => { console.error(error.code === 'EADDRINUSE' ? `포트 ${port}가 사용 중입니다. 실행 중인 미리보기를 열거나 PORT 값을 바꿔주세요.` : error.message); process.exitCode=1; });
server.listen(port,host,()=>console.log(`Koreo 회사: http://localhost:${port}/\n몸짓 웹: http://localhost:${port}/studio/\n몸짓 앱: http://localhost:${port}/app/\n종료: Ctrl+C · 서버/결제/외부 업로드 연결 없음`));
