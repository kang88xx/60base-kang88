import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The 촬영 키트 admin page against the real kit backend (CONTRACT "Operator"), not the older server/ copy.
// Production is a same-origin Vercel proxy, so this test serves the console files and forwards /api to the backend.
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
// The operations backend is deployed from its own Space repository, not from this repo's older server/ copy.
if (!process.env.EGO_BACKEND_DIR) throw new Error('Set EGO_BACKEND_DIR to a checkout of the operations backend (the directory that contains server/app.mjs).');
const backend = path.resolve(process.env.EGO_BACKEND_DIR);
if (!(await readFile(path.join(backend, 'server/app.mjs'), 'utf8')).includes('/admin/filming-kit-claims')) throw new Error(`${backend} has no /admin/filming-kit-claims route yet`);
const { createService } = await import(pathToFileURL(path.join(backend, 'server/app.mjs')));
const { hashPassword } = await import(pathToFileURL(path.join(backend, 'server/security.mjs')));
const { chromium, request: requests } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.resolve(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const output = path.resolve(repo, process.env.ADMIN_KIT_DIR || '.artifacts/admin-filming-kit');
await mkdir(output, { recursive: true });
const port = Number(process.env.ADMIN_KIT_PORT || 4402), base = `http://127.0.0.1:${port}`, backendPort = port + 1;
const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-admin-kit-'));
// The kit clock is the only fake time: claims open at 12:00 KST, deadlines and erasure follow it.
const kst = text => Date.parse(text + '+09:00');
let now = kst('2026-08-01T12:00:01');
const service = createService({ directory, origin: base, filmingKitEvent: { clock: () => now, claimLimit: 10 } });
await new Promise(resolve => service.server.listen(backendPort, '127.0.0.1', resolve));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
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

const password = 'Local-admin-kit-only-2026!', created = service.store.now();
const people = { admin: { role: 'admin', name: '키트 관리자' } };
// Sample people and addresses are fictional.
const members = {
  late: { name: '김지연', recipient: '', phone: '' },
  waiting: { name: '이도윤', recipient: '', phone: '' },
  ship: { name: '박에고', recipient: '박에고', phone: '01023456789', postcode: '04100', address1: '서울 마포구 예시로 12', address2: '101동 1001호', memo: '문 앞에 놓아주세요' },
  conflict: { name: '최서준', recipient: '최서준', phone: '01034567890', postcode: '48000', address1: '부산 해운대구 예시대로 34', address2: '502호', memo: '' },
  shipped: { name: '정하린', recipient: '정하린', phone: '01045678901', postcode: '61000', address1: '광주 북구 예시길 5', address2: '', memo: '' },
  canceled: { name: '한민재', recipient: '', phone: '' },
  purged: { name: '오수아', recipient: '오지훈', phone: '01056789012', postcode: '35000', address1: '대전 서구 예시로 77', address2: '3층', memo: '경비실' },
};
for (const [key, member] of Object.entries(members)) people[key] = { role: 'member', ...member };
for (const [key, person] of Object.entries(people)) service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)', 'kit-' + key, `kit-${key}@example.test`, await hashPassword(password), person.name, person.role, created, created);

const clients = {};
async function client(key) {
  const api = await requests.newContext({ baseURL: base, extraHTTPHeaders: { Origin: base } });
  const login = await api.post('/api/auth/login', { data: { email: `kit-${key}@example.test`, password } });
  assert.equal(login.status(), 200, 'login ' + key);
  const { csrf } = await login.json();
  const call = async (method, url, data) => { const response = await api.fetch(url, { method, data, headers: { 'X-CSRF-Token': csrf } }); const body = await response.json(); if (!response.ok()) throw Object.assign(Error(`${method} ${url} ${response.status()} ${body.error}`), { status: response.status() }); return body; };
  return (clients[key] = { api, call });
}
const claimId = key => service.store.one('SELECT id FROM filming_kit_claims WHERE userId=?', 'kit-' + key).id;
const delivery = key => service.store.one('SELECT * FROM filming_kit_deliveries WHERE claimId=?', claimId(key));
const claim = async key => (await client(key)).call('POST', '/api/filming-kit-event/claim', {});
const fillDelivery = key => { const { recipient, phone, postcode, address1, address2, memo } = members[key]; return clients[key].call('PUT', '/api/filming-kit-event/delivery', { recipient, phone, postcode, address1, address2, memo, consent: true }); };
const admin = await client('admin');
const adminPatch = (key, body) => admin.call('PATCH', '/api/admin/filming-kit-claims/' + claimId(key), { expectedUpdatedAt: delivery(key).updatedAt, ...body });

// Aug 1: claimed, filled and shipped the next day, so its details are erased 90 days later.
await claim('purged'); await fillDelivery('purged');
now = kst('2026-08-02T10:00:00'); await adminPatch('purged', { action: 'ship', carrier: '우체국택배', trackingNumber: '6070809010203', adminNote: '' });
// Nov 1: claimed and never filled, so the 7-day deadline has passed by Nov 15.
now = kst('2026-11-01T12:00:02'); await claim('late');
// Nov 14: one shipped, one canceled by the operator.
now = kst('2026-11-14T12:00:01'); await claim('shipped'); await fillDelivery('shipped');
now = kst('2026-11-14T12:00:02'); await claim('canceled');
now = kst('2026-11-14T15:00:00'); await adminPatch('shipped', { action: 'ship', carrier: 'CJ대한통운', trackingNumber: '123456789012', adminNote: '' });
await adminPatch('canceled', { action: 'cancel', reason: '참여자 요청으로 취소', adminNote: '' });
// Nov 15 (today): three claims, two with details.
now = kst('2026-11-15T12:00:01'); await claim('ship'); await fillDelivery('ship');
now = kst('2026-11-15T12:00:02'); await claim('conflict'); await fillDelivery('conflict');
now = kst('2026-11-15T12:00:03'); await claim('waiting');
now = kst('2026-11-15T12:30:00'); await service.maintenance();
assert.equal(delivery('purged').purgedAt != null, true, 'retention erased the Aug claim');
const personal = Object.values(members).flatMap(member => [member.recipient, member.phone, member.address1, member.address2, member.memo]).filter(value => value && value.length > 2);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [], consoleText = [], nativeDialogs = [], checks = [];
let kitReads = 0;
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => consoleText.push(message.text()));
page.on('dialog', dialog => { nativeDialogs.push(dialog.type()); void dialog.dismiss(); });
page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/admin/filming-kit-claims' && request.method() === 'GET') kitReads++; });
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
const settled = () => page.waitForFunction(() => !document.querySelector('#admin-main').hasAttribute('aria-busy') && !!document.querySelector('#admin-main [data-refresh]'));
const ids = () => page.locator('tbody [data-admin-action=kit]').evaluateAll(buttons => buttons.map(button => button.dataset.id).sort());
const pressed = () => page.locator('[data-kit-tab][aria-pressed=true]').getAttribute('data-kit-tab');
const tabCounts = () => page.locator('[data-kit-tab] strong').allTextContents();
const choose = async key => { await page.locator(`[data-kit-tab="${key}"]`).click(); await page.waitForFunction(value => document.querySelector('[data-kit-tab][aria-pressed=true]')?.dataset.kitTab === value, key); };
const openClaim = async key => { await page.locator(`tbody [data-admin-action=kit][data-id="${claimId(key)}"]`).click(); await page.locator('dialog[open]').waitFor(); return page.locator('dialog[open]'); };
const closed = async () => { await page.locator('dialog[open]').waitFor({ state: 'detached' }); await settled(); };
const sorted = keys => keys.map(claimId).sort();
try {
  await context.request.post(base + '/api/auth/login', { headers: { Origin: base }, data: { email: 'kit-admin@example.test', password } }).then(response => assert.equal(response.status(), 200));

  await page.goto(base + '/admin/#overview'); await settled();
  await page.goto(base + '/admin/#members'); await page.reload(); await settled();
  assert.equal(kitReads, 0, 'other pages never read the audited kit list');
  assert.deepEqual(await page.locator('.admin-nav-group').filter({ hasText: '참여자' }).locator('a').allTextContents(), ['회원 관리', '촬영 키트', '문의 관리', '공지 관리']);
  checks.push('Menu entry sits after 회원 관리 and the kit list is not read from other pages.');

  await page.locator('[data-admin-nav=kit]').click(); await page.waitForURL('**/admin/#kit'); await page.locator('[data-kit-results]').waitFor(); await settled();
  assert.equal(kitReads, 1); assert.equal(await page.locator('h1').textContent(), '촬영 키트');
  assert.equal(await page.locator('#admin-breadcrumb').textContent(), '촬영 키트');
  const kpis = await page.locator('.online-kpi').evaluateAll(cards => cards.map(card => [card.querySelector('span').textContent, card.querySelector('strong').textContent]));
  assert.deepEqual(kpis, [['오늘 신청', '3 / 10'], ['배송 정보 입력 대기', '2'], ['발송 대기', '2'], ['발송 완료', '2']]);
  assert.match(await page.locator('.online-kpi').nth(1).textContent(), /기한 지남 1건/);
  assert.equal(await pressed(), 'all'); assert.deepEqual(await tabCounts(), ['7', '2', '2', '2', '1']);
  assert.equal((await ids()).length, 7);
  assert.match(await page.locator('.admin-data-legend').textContent(), /목록 조회는 10분에 한 번, CSV 내려받기는 매번 변경 기록에 남습니다\. 배송 정보와 운영 메모는 발송·취소 90일 뒤 삭제됩니다\./);
  assert.deepEqual(await page.locator('thead th').evaluateAll(cells => cells.map(cell => cell.dataset.adminHeaderLabel)), ['신청 일시', '회원', '받는 분 · 연락처', '주소', '상태', '처리']);
  const lateRow = page.locator('tbody tr').filter({ has: page.locator(`[data-id="${claimId('late')}"]`) });
  assert.equal(await lateRow.locator('.admin-stage-chip').textContent(), '기한 지남'); assert.match(await lateRow.textContent(), /아직 입력 전/);
  const purgedRow = page.locator('tbody tr').filter({ has: page.locator(`[data-id="${claimId('purged')}"]`) });
  assert.equal(await purgedRow.locator('.admin-muted-text', { hasText: '삭제됨' }).count(), 2); assert.doesNotMatch(await purgedRow.textContent(), /오지훈|대전/);
  assert.match(await page.locator('tbody tr').filter({ has: page.locator(`[data-id="${claimId('shipped')}"]`) }).textContent(), /CJ대한통운 123456789012/);
  await page.screenshot({ path: path.join(output, 'kit-all.png'), fullPage: true });
  checks.push('KPIs, tab counts, overdue and erased rows match the backend.');

  await choose('preparing');
  assert.equal(new URL(page.url()).hash, '#kit?status=preparing');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'admin-kit-tab-preparing', 'focus stays on the chosen tab');
  assert.deepEqual(await ids(), sorted(['ship', 'conflict']));
  await page.reload(); await settled();
  assert.equal(await pressed(), 'preparing'); assert.deepEqual(await ids(), sorted(['ship', 'conflict']));
  await choose('canceled'); assert.deepEqual(await ids(), sorted(['canceled'])); assert.equal(new URL(page.url()).hash, '#kit?status=canceled');
  await choose('all'); assert.equal(new URL(page.url()).hash, '#kit');
  checks.push('Status tabs filter, write only the status to the hash and survive a reload.');

  const search = async (text, expected) => { await page.locator('#admin-search').fill(text); assert.deepEqual(await ids(), sorted(expected), 'search ' + text); assert.match(new URL(page.url()).hash, /^#kit(\?status=[a-z_]+)?$/); };
  await search('박에고', ['ship']); await search('kit-late@example', ['late']); await search('010-3456', ['conflict']); await search('01034567890', ['conflict']);
  await search('123456789012', ['shipped']); await search(claimId('canceled'), ['canceled']); await search('정하린', ['shipped']); await search('없는 사람', []);
  assert.match(await page.locator('.online-empty').textContent(), /검색 조건에 맞는 신청이 없습니다/);
  await page.locator('#admin-search-reset').click(); assert.equal((await ids()).length, 7); assert.equal(await page.locator('#admin-search-reset').isDisabled(), true);
  await page.locator('[data-admin-sort="0"]').click(); await page.locator('[data-admin-sort="0"]').click();
  assert.equal(await page.locator('tbody [data-admin-action=kit]').first().getAttribute('data-id'), claimId('waiting'), 'newest first after sorting by claim time descending');
  checks.push('Search covers member, email, recipient, phone, tracking number and claim id; sorting works.');

  let d = await openClaim('waiting');
  assert.match(await d.locator('h2').textContent(), /배송 정보 입력 대기 · 이도윤/);
  assert.equal(await d.locator('[data-kit-ship]').count(), 0);
  await d.locator('[data-kit-remind] button[type=submit]').click(); await closed();
  assert.match(await page.locator('[data-kit-notice]').textContent(), /입력 알림을 다시 보냈습니다/);
  assert.equal(delivery('waiting').remindedAt != null, true);
  checks.push('입력 대기 → 알림 다시 보내기 reaches the backend and confirms in the page.');

  d = await openClaim('ship');
  assert.match(await d.locator('h2').textContent(), /발송 처리 · 박에고/);
  assert.match(await d.locator('.admin-detail-grid').textContent(), /\(04100\) 서울 마포구 예시로 12, 101동 1001호/);
  await d.locator('[data-kit-copy=phone]').click(); await d.locator('[data-kit-copy-status]').filter({ hasText: '복사했습니다 · 연락처' }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '010-2345-6789');
  await d.locator('[data-kit-copy=address]').click(); await page.waitForFunction(() => navigator.clipboard.readText().then(text => text.startsWith('(04100)')));
  await d.locator('[data-kit-copy=recipient]').click(); await page.waitForFunction(() => navigator.clipboard.readText().then(text => text === '박에고'));
  await d.locator('select[name=carrier]').selectOption('CJ대한통운'); await d.locator('input[name=trackingNumber]').fill('12 34');
  await d.locator('[data-kit-ship] button[type=submit]').click();
  assert.equal(await d.locator('input[name=trackingNumber]').evaluate(input => input.validity.valid), false, 'a short tracking number is caught before sending');
  assert.equal(delivery('ship').status, 'preparing');
  await d.locator('input[name=trackingNumber]').fill('1234-5678-9012'); await d.locator('textarea[name=adminNote]').fill('11/17 오전 편의점 접수');
  await page.screenshot({ path: path.join(output, 'kit-ship-dialog.png') });
  await d.locator('[data-kit-ship] button[type=submit]').click(); await closed();
  assert.deepEqual([delivery('ship').status, delivery('ship').carrier, delivery('ship').trackingNumber, delivery('ship').adminNote], ['shipped', 'CJ대한통운', '1234-5678-9012', '11/17 오전 편의점 접수']);
  assert.match(await page.locator('[data-kit-notice]').textContent(), /발송 완료로 저장/);
  assert.deepEqual(await tabCounts(), ['7', '2', '1', '3', '1']);
  checks.push('발송 대기 → 발송 처리 with copy buttons, validation and operator note.');

  d = await openClaim('conflict');
  await d.locator('select[name=carrier]').selectOption('한진택배'); await d.locator('input[name=trackingNumber]').fill('HJ-55556666'); await d.locator('textarea[name=adminNote]').fill('운영자 A 메모');
  await adminPatch('conflict', { action: 'note', adminNote: '다른 운영자 메모' });
  await d.locator('[data-kit-ship] button[type=submit]').click();
  await d.locator('[data-kit-ship] [role=status]').filter({ hasText: '다른 변경이 있어요' }).waitFor();
  assert.match(await d.locator('[data-kit-ship] [role=status]').textContent(), /입력한 내용은 그대로 두었습니다.*새로고침/);
  assert.deepEqual([await d.locator('select[name=carrier]').inputValue(), await d.locator('input[name=trackingNumber]').inputValue(), await d.locator('textarea[name=adminNote]').inputValue()], ['한진택배', 'HJ-55556666', '운영자 A 메모']);
  assert.equal(delivery('conflict').status, 'preparing');
  await page.screenshot({ path: path.join(output, 'kit-409.png') });
  await d.locator('[data-close]').click(); await page.locator('[data-refresh]').click(); await settled();
  checks.push('A stale update shows the server 409 message, keeps the typed values and asks for a refresh.');

  d = await openClaim('conflict');
  assert.equal(await d.locator('textarea[name=adminNote]').inputValue(), '다른 운영자 메모', 'refresh shows the other operator note');
  await d.locator('[data-kit-cancel-open]').click(); await d.locator('input[name=reason]').fill('ab');
  assert.match(await d.locator('#admin-kit-reason-help').textContent(), /운영 메모도 함께 저장/);
  await d.locator('[data-kit-cancel-submit]').click();
  assert.equal(await d.locator('input[name=reason]').evaluate(input => input.validity.valid), false); assert.equal(await d.locator('[data-kit-cancel-confirm]').isHidden(), true);
  // A hidden format character passes the page but the server refuses it; its message sits under the reason field.
  await d.locator('input[name=reason]').fill('주소\u202e 확인 불가');
  await d.locator('[data-kit-cancel-submit]').click(); await d.locator('[data-kit-cancel-confirm]').waitFor(); await d.locator('[data-kit-cancel-submit]').click();
  await d.locator('[data-kit-field-error=reason]').filter({ hasText: '취소 사유' }).waitFor();
  assert.equal(await d.locator('input[name=reason]').getAttribute('aria-invalid'), 'true'); assert.equal(delivery('conflict').status, 'preparing');
  await d.locator('[data-kit-cancel-back]').click(); await d.locator('input[name=reason]').fill('');
  await d.locator('input[name=reason]').evaluate(input => { const data = new DataTransfer(); data.setData('text/plain', '주소 확인\r\n불가로 취소'); input.focus(); input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
  assert.equal(await d.locator('input[name=reason]').inputValue(), '주소 확인 불가로 취소', 'pasted line breaks become spaces');
  assert.equal(await d.locator('[data-kit-field-error=reason]').isHidden(), true, 'editing clears the server message');
  await d.locator('[data-kit-cancel-submit]').click();
  await d.locator('[data-kit-cancel-confirm]').waitFor();
  assert.equal(await d.locator('[data-kit-cancel-submit]').textContent(), '신청 취소 확정'); assert.equal(delivery('conflict').status, 'preparing', 'the first step does not cancel');
  await page.screenshot({ path: path.join(output, 'kit-cancel-confirm.png') });
  await d.locator('[data-kit-cancel-back]').click(); assert.equal(await d.locator('[data-kit-cancel-confirm]').isHidden(), true);
  await d.locator('[data-kit-cancel-submit]').click(); await d.locator('[data-kit-cancel-confirm]').waitFor();
  await d.locator('[data-kit-cancel-submit]').click(); await closed();
  assert.deepEqual([delivery('conflict').status, delivery('conflict').cancelReason, delivery('conflict').adminNote], ['canceled', '주소 확인 불가로 취소', '다른 운영자 메모']);
  assert.deepEqual(nativeDialogs, [], 'no window.confirm/alert');
  checks.push('신청 취소 needs a one-line reason and an in-dialog confirmation step; a refused reason shows under the field.');

  await choose('shipped'); d = await openClaim('shipped');
  const shippedAt = delivery('shipped').shippedAt;
  assert.equal(await d.locator('select[name=carrier]').inputValue(), 'CJ대한통운'); assert.equal(await d.locator('[data-kit-cancel-open]').count(), 0);
  await d.locator('select[name=carrier]').selectOption('롯데택배'); await d.locator('input[name=trackingNumber]').fill('LT987654321');
  await d.locator('[data-kit-ship] button[type=submit]').click(); await closed();
  assert.deepEqual([delivery('shipped').carrier, delivery('shipped').trackingNumber, delivery('shipped').shippedAt], ['롯데택배', 'LT987654321', shippedAt]);
  d = await openClaim('purged');
  assert.equal(await d.locator('.admin-detail-grid .admin-muted-text', { hasText: '삭제됨' }).count(), 4); assert.equal(await d.locator('[data-kit-copy]').count(), 0); assert.equal(await d.locator('[data-kit-ship]').count(), 0, 'nothing left to correct once erased');
  await d.locator('[data-close]').click();
  checks.push('발송 완료 → carrier/tracking correction keeps the first shipping time; erased details show 삭제됨.');

  await choose('canceled'); d = await openClaim('canceled');
  assert.equal(await d.locator('[data-kit-ship], [data-kit-remind], [data-kit-cancel-open]').count(), 0);
  assert.match(await d.locator('.admin-detail-grid').textContent(), /참여자 요청으로 취소/);
  await d.locator('textarea[name=adminNote]').fill('회신\u202e 메모'); await d.locator('[data-kit-note] button[type=submit]').click();
  await d.locator('[data-kit-field-error=adminNote]').filter({ hasText: '메모' }).waitFor();
  assert.equal(await d.locator('textarea[name=adminNote]').getAttribute('aria-invalid'), 'true'); assert.equal(await d.locator('textarea[name=adminNote]').inputValue(), '회신\u202e 메모');
  await d.locator('textarea[name=adminNote]').fill('문의 회신 완료\n다음 주 재확인'); assert.equal(await d.locator('[data-kit-field-error=adminNote]').isHidden(), true);
  await d.locator('[data-kit-note] button[type=submit]').click(); await closed();
  assert.equal(delivery('canceled').adminNote, '문의 회신 완료\n다음 주 재확인');
  checks.push('취소 → view and operator note; a refused note shows the server message under the field.');

  assert.equal(await page.locator('a.admin-export').getAttribute('href'), '/api/admin/export?type=kit');
  const exported = await context.request.get(base + '/api/admin/export?type=kit');
  assert.equal(exported.status(), 200); assert.match(exported.headers()['content-type'], /text\/csv/);
  assert.match((await exported.text()).split('\n')[0], /신청번호.*받는 분.*송장번호.*발송일/);
  checks.push('CSV button points at the kit export, which the backend serves.');

  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, hash: location.hash }));
  for (const value of personal) { assert.equal(storage.includes(value), false, 'personal data in storage or hash'); assert.equal(consoleText.some(text => text.includes(value)), false, 'personal data in console'); }
  checks.push('No personal data in the hash, browser storage or console.');

  // Markup from members and participants must render as text in the table and the dialog.
  const markup = { name: '<img src=x onerror="window.__kitXss=1">"\'&', recipient: '<img src=x onerror=window.__kitXss=2>', phone: '01067890123', postcode: '06000', address1: '<script>window.__kitXss=3</script> 서울 "예시" 1', address2: "'><svg onload=window.__kitXss=4>", memo: '<iframe src="javascript:window.__kitXss=5"></iframe>' };
  members.markup = markup;
  service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)', 'kit-markup', 'kit-markup@example.test', await hashPassword(password), markup.name, 'member', created, created);
  now = kst('2026-11-15T12:40:00'); await claim('markup'); await fillDelivery('markup');
  await choose('preparing'); await page.locator('[data-refresh]').click(); await page.locator(`[data-id="${claimId('markup')}"]`).waitFor(); await settled();
  const markupRow = page.locator('tbody tr').filter({ has: page.locator(`[data-id="${claimId('markup')}"]`) });
  const rowText = await markupRow.textContent();
  for (const value of [markup.name, markup.recipient, markup.address1, markup.address2, markup.memo]) assert.equal(rowText.includes(value), true, 'shown as text: ' + value);
  assert.equal(await markupRow.locator('img, script, svg, iframe').count(), 0);
  d = await openClaim('markup');
  assert.equal(await d.locator('h2').textContent(), '발송 처리 · ' + markup.name);
  const dialogText = await d.locator('.admin-detail-grid').textContent();
  for (const value of [markup.name, markup.recipient, markup.address1, markup.address2, markup.memo]) assert.equal(dialogText.includes(value), true, 'dialog text: ' + value);
  assert.equal(await d.locator('img, script, svg, iframe').count(), 0);
  await d.locator('[data-kit-copy=recipient]').click(); await page.waitForFunction(value => navigator.clipboard.readText().then(text => text === value), markup.recipient);
  assert.equal(await page.evaluate(() => window.__kitXss), undefined, 'no injected handler ran');
  await d.locator('[data-close]').click(); await choose('all');
  checks.push('Markup and quotes in member and delivery fields render as text in the table and dialog.');

  await page.setViewportSize({ width: 390, height: 844 }); await choose('all'); await page.reload(); await settled();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'no horizontal page scroll at 390px');
  await page.screenshot({ path: path.join(output, 'kit-390.png'), fullPage: true });
  d = await openClaim('waiting');
  assert.equal(await page.evaluate(() => { const dialog = document.querySelector('dialog[open]'); return dialog.scrollWidth <= dialog.clientWidth && document.documentElement.scrollWidth <= document.documentElement.clientWidth; }), true, 'dialog fits at 390px');
  await page.screenshot({ path: path.join(output, 'kit-dialog-390.png') });
  checks.push('Page and dialog fit 390px without horizontal overflow.');

  // A session that disappears mid-task falls back to the console's own recovery.
  service.store.run('DELETE FROM sessions WHERE userId=?', 'kit-admin');
  await d.locator('textarea[name=adminNote]').fill('세션 만료 후 저장'); await d.locator('[data-kit-note] button[type=submit]').click();
  await page.locator('.admin-login').waitFor(); assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#admin-main').textContent().then(text => personal.some(value => text.includes(value))), false);
  checks.push('An expired session closes the dialog and returns to the console login.');

  const memberContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState: await clients.ship.api.storageState() });
  const memberPage = await memberContext.newPage();
  let memberKitReads = 0; memberPage.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/admin/filming-kit')) memberKitReads++; });
  memberPage.on('pageerror', error => errors.push(error.message));
  await memberPage.goto(base + '/admin/#kit'); await memberPage.locator('.admin-login').waitFor();
  assert.match(await memberPage.locator('.admin-login h1').textContent(), /관리자 계정으로 로그인해주세요/);
  assert.equal(memberKitReads, 0);
  // The member's own name shows on the account button; nobody else's delivery details may appear.
  const memberText = await memberPage.locator('body').textContent(), others = personal.filter(value => !Object.values(members.ship).includes(value));
  assert.equal(others.some(value => memberText.includes(value)), false, 'no delivery details for a member');
  assert.equal((await memberContext.request.get(base + '/api/admin/filming-kit-claims')).status(), 403);
  await memberPage.screenshot({ path: path.join(output, 'kit-member.png') });
  await memberContext.close();
  checks.push('A member sees no kit data and the backend refuses the list.');

  assert.deepEqual(errors, []);
  console.log(checks.map(check => 'ok - ' + check).join('\n'));
  console.log(`backend: ${backend}`);
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  console.error('Browser errors:', errors); throw error;
} finally {
  await browser.close(); for (const { api } of Object.values(clients)) await api.dispose();
  await new Promise(resolve => proxy.close(resolve)); await service.close(); await rm(directory, { recursive: true, force: true });
}
