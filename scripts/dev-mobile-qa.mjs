// Development-only, loopback-only QA. Never imports provider/env adapters or uses
// a persistent service directory. Login and every API operation use createService.
import { mkdtemp, readFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server/app.mjs';
import { hashPassword } from '../server/security.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.argv.find(value => value.startsWith('--port='))?.slice(7) || 5175);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid QA port.');
const origin = `http://127.0.0.1:${port}`;
const email = 'ego-qa@example.test', emptyEmail = 'ego-empty@example.test';
const password = 'Local-Ego-QA-2026!'; // Disposable local fixture, never a production account.
const directory = await mkdtemp(path.join(tmpdir(), 'ego-mobile-qa-'));
const service = createService({ directory, origin, allowRegistration: false });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  service.server.closeAllConnections();
  await service.close();
  const relative = path.relative(path.resolve(tmpdir()), path.resolve(directory));
  if (!relative.startsWith('ego-mobile-qa-') || relative.includes(path.sep)) throw Error('Unexpected QA cleanup path.');
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stop().then(() => process.exit(0), error => { console.error(error); process.exit(1); }); });

try {
  const { run, one, now } = service.store;
  const encoded = await hashPassword(password), createdAt = now();
  for (const [id, address, name] of [['qa_member', email, '로컬 QA'], ['qa_empty', emptyEmail, '빈 계정 QA'], ['qa_admin', 'ego-admin@example.test', '로컬 QA 관리자']]) {
    run('INSERT INTO users(id,email,password,name,createdAt,updatedAt,consent) VALUES(?,?,?,?,?,?,?)',
      id, address, encoded, name, createdAt, createdAt,
      JSON.stringify({ terms: true, privacy: true, adult: true, localQaFixture: true }));
  }
  run("UPDATE users SET role='admin' WHERE id='qa_admin'");
  run('UPDATE settings SET value=? WHERE key=?', JSON.stringify('LOCAL QA · 가상 검증 데이터 · 운영 서버 연결 없음'), 'notice');
  // Real repository sample bytes; the durations/statuses below are explicitly
  // synthetic fixture metadata, not claims about participant submissions.
  const samples = [
    ['dishwashing', 'dishwashing', '설거지', 'approved', 'complete'],
    ['folding-clothes', 'folding-clothes', '빨래 개기', 'reviewing', 'manual'],
    ['cutting-vegetables', 'cutting-vegetables', '채소 손질', 'rejected', 'manual'],
    ['vacuuming', 'bedroom', '청소', 'uploaded', 'ai'],
  ];
  for (const [index, [filename, taskId, title, status, reviewStage]] of samples.entries()) {
    const id = `qa_video_${index + 1}`, source = path.join(root, 'assets/videos/collection', filename + '.mp4');
    const bytes = await readFile(source), task = one('SELECT * FROM tasks WHERE id=?', taskId);
    await copyFile(source, path.join(directory, 'videos', id));
    const at = new Date(Date.now() - (index + 1) * 86400000).toISOString();
    run(`INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,captureTask,path,sha,status,reviewStage,revision,createdAt,submittedAt,reviewedAt,reason,checks,consent)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, 'qa_member', taskId, '[로컬 QA] ' + title,
      filename + '.mp4', 'video/mp4', bytes.length, 60 + index * 15, 1920, 1080, task.reward,
      JSON.stringify(task), id, createHash('sha256').update(bytes).digest('hex'), status, reviewStage, status === 'uploaded' ? 0 : 1,
      at, status === 'uploaded' ? null : at, ['approved', 'rejected'].includes(status) ? at : null,
      status === 'rejected' ? '로컬 QA 반려 상태 예시: 손과 작업 대상의 구도를 확인해주세요.' : '',
      JSON.stringify({ framing: true, hands: true, privacy: true, completion: true }), JSON.stringify({ localQaFixture: true }));
    if (status === 'approved') run('INSERT INTO ledger VALUES(?,?,?,?,?,?)', 'qa_reward_1', 'qa_member', task.reward, 'reward', id, at);
  }
  run('INSERT INTO announcements VALUES(?,?,?,?,?,?)', 'qa_notice', '로컬 QA 안내', '이 계정의 영상 상태와 포인트는 임시 검증 데이터입니다.', 1, createdAt, createdAt);

  const wrapper = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOCAL QA · ego 모바일 검증</title>
  <style>*{box-sizing:border-box}body{margin:0;background:#e9e9e5;color:#252620;font:14px system-ui,sans-serif}header{padding:14px 20px;background:#fff;border-bottom:1px solid #d7d7d0;display:flex;align-items:center;gap:12px;flex-wrap:wrap}strong{color:#c43800}code{user-select:all}button,select,a{font:inherit;padding:6px 9px}label{display:flex;align-items:center;gap:5px}main{padding:20px;display:grid;place-items:start center}iframe{width:390px;height:844px;border:1px solid #ccc;border-radius:24px;background:white;box-shadow:0 12px 44px #0002;max-width:100%}small{width:100%;color:#686860}</style></head><body>
  <header><strong>LOCAL QA · 가상 검증 데이터</strong><span>운영 서버·Firebase·외부 업로드 연결 없음</span>
  <label>화면 <select id="size"><option value="390,844">390 × 844</option><option value="375,812">375 × 812</option><option value="430,932">430 × 932</option><option value="1440,900">1440 × 900</option></select></label>
  <label>위치 <select id="route"><option value="home">홈</option><option value="ranking">랭킹</option><option value="wallet">지갑</option><option value="profile">프로필</option><option value="missions">활동</option><option value="library">내 영상</option><option value="settings">설정</option></select></label><button id="refresh" type="button">새로고침</button><a href="/app/#home" target="_blank" rel="noopener">전체 창</a><a href="/admin/" target="_blank" rel="noopener">로컬 관리자 설정 QA</a><a href="/__qa/verification" target="_blank" rel="noopener">인증번호 디자인 QA</a>
  <small>이메일: <code>${email}</code> · 비밀번호: <code>${password}</code> · 빈 계정: <code>${emptyEmail}</code> · 관리자: <code>ego-admin@example.test</code> (같은 비밀번호). 앱의 일반 이메일 로그인 사용. 서버 재시작 시 모든 QA 데이터 초기화.</small></header>
  <main><iframe id="screen" title="로컬 QA 앱 · 가상 검증 데이터" src="/app/#home" allow="camera; microphone; fullscreen" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"></iframe></main>
  <script>const frame=document.querySelector('#screen');document.querySelector('#size').onchange=e=>{const [w,h]=e.target.value.split(',');frame.style.width=w+'px';frame.style.height=h+'px'};document.querySelector('#route').onchange=e=>{frame.contentWindow.location.hash=e.target.value};document.querySelector('#refresh').onclick=()=>frame.contentWindow.location.reload();frame.onload=()=>{const d=frame.contentDocument;const style=d.createElement('style');style.textContent='html{scrollbar-width:none}html::-webkit-scrollbar{display:none}';d.head.append(style);frame.contentWindow.addEventListener('hashchange',()=>{const route=frame.contentWindow.location.hash.slice(1),select=document.querySelector('#route');if([...select.options].some(option=>option.value===route))select.value=route;});};</script></body></html>`;
  const handler = service.server.listeners('request')[0];
  service.server.removeAllListeners('request');
  service.server.on('request', async (req, res) => {
    const send = (status, type, body) => { res.writeHead(status, { 'Content-Type': type }); res.end(req.method === 'HEAD' ? undefined : body); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Ego-QA', 'local-fixtures');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Helper-only policy: app may appear in this local wrapper, and no browser
    // scripts, fetches, images or media can connect to external services.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self'; frame-src 'self'; frame-ancestors 'self'; form-action 'self'; object-src 'none'; base-uri 'self'");
    if (req.headers.host !== new URL(origin).host) return send(421, 'text/plain', 'Use ' + origin);
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) => setHeader(name, name.toLowerCase() === 'x-frame-options' ? 'SAMEORIGIN' : value);
    try {
      const url = new URL(req.url, origin);
      if (['/__qa/intro-final', '/__qa/intro-final/'].includes(url.pathname)) {
        const source = await readFile(path.join(root, 'app/index.html'), 'utf8');
        const intro = source.match(/<section class="app-launch" id="app-launch"[\s\S]*?<\/section>/)?.[0];
        if (!intro) throw Error('Intro markup not found.');
        // Static QA only: reuse the actual production markup/styles, import no
        // runtime modules, and never add a production query/replay mechanism.
        const html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<body>[\s\S]*<\/body>/, `<body>${intro.replace(' hidden ', ' ')}<style>.app-launch-flood{display:none}.app-launch{pointer-events:none}.intro-qa-label{position:fixed;z-index:61;left:12px;bottom:8px;margin:0;color:#6a6865;font:9px/1.2 sans-serif;pointer-events:none}</style><p class="intro-qa-label">LOCAL QA · D 최종 정적 프레임</p></body>`);
        return send(200, 'text/html; charset=utf-8', html.replace('<head>', '<head><base href="/app/">'));
      }
      if (['/__qa/verification', '/__qa/verification/'].includes(url.pathname)) return send(200, 'text/html; charset=utf-8', await readFile(path.join(root, 'tools/verification-code-preview.html'), 'utf8'));
      if (['/', '/__qa', '/__qa/'].includes(url.pathname)) return send(200, 'text/html; charset=utf-8', wrapper);
      if (['/studio/firebase-config.js', '/app/firebase-config.js'].includes(url.pathname)) return send(200, 'text/javascript', 'export const firebaseConfig = null;');
      if (url.pathname === '/app/sw.js') return send(200, 'text/javascript', "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));");
      if (['/app/', '/app/index.html', '/admin/', '/admin/index.html'].includes(url.pathname)) {
        const isAdmin = url.pathname.startsWith('/admin/');
        let html = await readFile(path.join(root, isAdmin ? 'admin/index.html' : 'app/index.html'), 'utf8');
        if (isAdmin) html = html.replace(/<body([^>]*)>/, '<body$1><aside style="padding:10px 18px;background:#fff0e7;color:#8d3916;font:13px system-ui,sans-serif">LOCAL QA · 가상 관리자·검증 데이터 · 운영 서버 연결 없음</aside>');
        return send(200, 'text/html; charset=utf-8', html.replace('<title>', '<title>[LOCAL QA] '));
      }
      await handler(req, res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      console.error('Local QA request failed:', error.message);
      send(500, 'text/plain', 'Local QA request failed.');
    }
  });
  await new Promise((resolve, reject) => { service.server.once('error', reject); service.server.listen(port, '127.0.0.1', resolve); });
  console.log(`LOCAL QA only: ${origin}/__qa/\nEmail: ${email}\nPassword: ${password}\nEmpty account: ${emptyEmail}\nTemporary data: ${directory}\nUse the app's normal email login. No production data/providers. Ctrl+C removes this temporary database.`);
} catch (error) {
  await stop();
  throw error;
}
