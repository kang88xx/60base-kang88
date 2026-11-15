import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// studio/postcode.html is framed by the EGO app for Kakao address search. Kakao itself is never called here:
// its script URL and its search frame are answered by stubs that follow the real loader's embed shape
// (an about:blank layer frame with a written <iframe src="https://postcode.map.kakao.com/search...">).
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.resolve(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const output = path.resolve(repo, process.env.STUDIO_POSTCODE_DIR || '.artifacts/studio-postcode');
await mkdir(output, { recursive: true });
const port = Number(process.env.STUDIO_POSTCODE_PORT || 4412), base = `http://127.0.0.1:${port}`, pageUrl = base + '/studio/postcode.html';
const kakaoScript = 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
const allowedParent = 'http://localhost:5183', otherParent = 'https://not-the-app.example';

// Headers come from vercel.json exactly as Vercel applies "continue" header routes, so the test checks the shipped rule.
const { routes } = JSON.parse(await readFile(path.join(repo, 'vercel.json'), 'utf8'));
const headerRoutes = routes.filter(route => route.headers && route.continue && !route.has && !route.status);
const headersFor = pathname => Object.assign({}, ...headerRoutes.filter(route => new RegExp(route.src).test(pathname)).map(route => route.headers));
const redirectFor = pathname => { for (const route of routes) { if (route.handle) return null; if (route.has || !new RegExp(route.src).test(pathname)) continue; if (route.status >= 300 && route.status < 400) return route.headers.Location; if (route.dest) return null; } return null; };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, base).pathname, file = path.resolve(repo, '.' + pathname);
  if (!/^\/studio\/[\w-]+\.(?:html|js|css)$/.test(pathname) || !file.startsWith(repo + path.sep)) { res.writeHead(404).end(); return; }
  try { const content = await readFile(file); res.writeHead(200, { ...headersFor(pathname), 'Content-Type': types[path.extname(file)] }); res.end(content); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));

const checks = [];
assert.equal((await fetch(pageUrl)).headers.get('content-security-policy'), headersFor('/studio/postcode.html')['Content-Security-Policy'], 'the static server sends the configured CSP');
const csp = headersFor('/studio/postcode.html')['Content-Security-Policy'] || '';
assert.match(csp, /frame-ancestors capacitor:\/\/localhost https:\/\/localhost http:\/\/localhost:5183 http:\/\/127\.0\.0\.1:5183$/);
assert.match(csp, /script-src 'self' https:\/\/t1\.kakaocdn\.net;/); assert.match(csp, /frame-src https:\/\/postcode\.map\.kakao\.com;/);
for (const pathname of ['/studio/privacy.html', '/studio/terms.html', '/studio/delete-account.html', '/studio/postcode.js', '/', '/admin/']) assert.equal(headersFor(pathname)['Content-Security-Policy'], undefined, 'no CSP change for ' + pathname);
assert.equal(routes.filter(route => JSON.stringify(route).includes('frame-ancestors')).length, 1, 'only one route may set frame-ancestors');
assert.equal(redirectFor('/studio/postcode.html'), null); assert.equal(redirectFor('/studio/postcode.js'), null); assert.equal(redirectFor('/studio/'), '/');
assert.equal(headersFor('/studio/postcode.html')['X-Robots-Tag'], 'noindex, nofollow');
checks.push('vercel.json frames only /studio/postcode.html, from the app origins, and does not redirect it.');

let kakaoMode = 'stub', kakaoRequests = 0, scriptRequests = 0;
const fakeKakao = `window.kakao = { Postcode: function (options) {
  if (${JSON.stringify('throws')} === window.__mode) throw new Error('broken widget');
  this.embed = function (element) {
    var layer = document.createElement('div'), frame = document.createElement('iframe');
    frame.src = 'about:blank'; layer.appendChild(frame); element.appendChild(layer);
    frame.contentWindow.document.write('<iframe id="search" src="https://postcode.map.kakao.com/search?origin=' + encodeURIComponent(location.origin) + '" style="width:100%;height:100%;border:0"></iframe>');
    frame.contentWindow.document.close();
    window.__egoTestComplete = function (data) { options.oncomplete(data); };
  };
} };`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const blocked = [], pageErrors = [];
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.href === kakaoScript) { kakaoRequests++; return kakaoMode === 'missing' ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'text/javascript', body: (kakaoMode === 'throws' ? 'window.__mode="throws";' : '') + fakeKakao }); }
  if (url.origin === 'https://postcode.map.kakao.com') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>stub search</p>' });
  if (url.pathname === '/parent.html' && [allowedParent, otherParent].includes(url.origin)) {
    const target = url.searchParams.get('target');
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><script>window.__messages=[];addEventListener('message',event=>__messages.push({origin:event.origin,data:event.data}));</script><iframe id="postcode" src="${target}" width="390" height="700"></iframe>` });
  }
  if (url.origin === base) {
    if (url.pathname === '/studio/postcode.js') scriptRequests++;
    // Served through the route (with the static server's real headers) so Chrome's local-network checks do not
    // treat the stubbed parents as public sites. 'without-csp' simulates a missing frame-ancestors rule.
    const response = await route.fetch(), headers = { ...response.headers() };
    if (url.searchParams.has('without-csp')) delete headers['content-security-policy'];
    return route.fulfill({ response, headers });
  }
  blocked.push(url.href); return route.abort();
});
const page = await context.newPage();
const consoleText = [];
page.on('console', message => consoleText.push(message.text()));
page.on('pageerror', error => pageErrors.push(error.message));
const messages = () => page.evaluate(() => window.__messages);
const frame = () => page.frames().find(item => item.url().startsWith(pageUrl));
const openParent = async (origin, target = pageUrl) => { consoleText.length = 0; await page.goto(`${origin}/parent.html?target=${encodeURIComponent(target)}`); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await openParent(allowedParent);
  await page.waitForFunction(() => window.__messages.length >= 1);
  await frame().waitForFunction(() => typeof window.__egoTestComplete === 'function' && document.querySelector('#postcode iframe')?.contentDocument?.querySelector('#search'));
  assert.equal(await frame().locator('#postcode-direct').isHidden(), true);
  await frame().evaluate(() => window.__egoTestComplete({ zonecode: '04100', roadAddress: '서울 마포구 예시로 12', address: '서울 마포구 예시동 1-2', jibunAddress: '서울 마포구 예시동 1-2', buildingName: '예시빌딩' }));
  await frame().evaluate(() => window.__egoTestComplete({ zonecode: '48000', roadAddress: '', address: '부산 해운대구 예시동 3' }));
  await page.waitForFunction(() => window.__messages.length >= 3);
  assert.deepEqual(await messages(), [
    { origin: base, data: { source: 'ego-postcode', type: 'ready' } },
    { origin: base, data: { source: 'ego-postcode', type: 'selected', zonecode: '04100', address: '서울 마포구 예시로 12' } },
    { origin: base, data: { source: 'ego-postcode', type: 'selected', zonecode: '48000', address: '부산 해운대구 예시동 3' } },
  ]);
  assert.equal(consoleText.filter(text => /Content Security Policy/i.test(text)).length, 0, 'the widget shape runs under the page CSP: ' + consoleText.join(' | '));
  // Messages from the parent are ignored: nothing is echoed back and no extra message appears.
  await page.evaluate(() => document.querySelector('#postcode').contentWindow.postMessage({ source: 'ego-postcode', type: 'selected', zonecode: '00000', address: 'x' }, '*'));
  await pause(300); assert.equal((await messages()).length, 3);
  await page.screenshot({ path: path.join(output, 'framed-allowed.png') });
  checks.push('An allowed parent receives ready, then selected with the 5-digit code and road address (address as fallback).');

  const before = scriptRequests; await openParent(otherParent); await pause(1500);
  assert.deepEqual(await messages(), []); assert.equal(scriptRequests, before, 'a blocked frame never runs the page script');
  assert.match(consoleText.join('\n'), /frame-ancestors/, 'blocked by the CSP frame-ancestors rule');
  checks.push('A parent outside frame-ancestors cannot frame the page and receives nothing.');

  await openParent(otherParent, pageUrl + '?without-csp');
  await frame().waitForFunction(() => typeof window.__egoTestComplete === 'function');
  await frame().evaluate(() => window.__egoTestComplete({ zonecode: '04100', roadAddress: '서울 마포구 예시로 12' })); await pause(500);
  assert.deepEqual(await messages(), []);
  checks.push('Even without the header, messages only target the app origins, so another parent receives nothing.');

  kakaoMode = 'missing'; await openParent(allowedParent); await page.waitForFunction(() => window.__messages.length >= 1); await pause(300);
  assert.deepEqual(await messages(), [{ origin: base, data: { source: 'ego-postcode', type: 'error' } }]);
  kakaoMode = 'throws'; await openParent(allowedParent); await page.waitForFunction(() => window.__messages.length >= 1); await pause(300);
  assert.deepEqual(await messages(), [{ origin: base, data: { source: 'ego-postcode', type: 'error' } }]);
  checks.push('A failed script load or a throwing widget posts error.');

  kakaoMode = 'stub'; const kakaoBefore = kakaoRequests;
  await page.goto(pageUrl);
  assert.equal(await page.locator('body').innerText(), '이 페이지는 EGO 앱 안에서 주소를 검색할 때 사용합니다.');
  await pause(300); assert.equal(kakaoRequests, kakaoBefore, 'opened directly, Kakao is not loaded');
  assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'noindex,nofollow');
  assert.deepEqual(await page.locator('script').evaluateAll(scripts => scripts.map(script => script.getAttribute('src'))), ['postcode.js']);
  await page.screenshot({ path: path.join(output, 'direct.png') });
  checks.push('Opened directly, the page shows one plain sentence and loads nothing else.');

  assert.deepEqual(blocked, [], 'no other network requests'); assert.deepEqual(pageErrors, []);
  console.log(checks.map(check => 'ok - ' + check).join('\n'));
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
