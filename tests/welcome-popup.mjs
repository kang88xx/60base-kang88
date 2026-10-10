import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/app.mjs';
import { createWelcomePopupService } from '../server/welcome-popup.mjs';
import { hashPassword } from '../server/security.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-popup-'));
const origin = 'http://localhost:4397';
let service, base;
const password = 'Popup-QA-only-password-2026!';
async function start() {
  service = createService({ directory, origin });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${service.server.address().port}`;
}
function client() {
  return { cookie: '', csrf: '', async call(route, { method = 'GET', body, status = 200, headers = {} } = {}) {
    const response = await fetch(base + '/api' + route, { method, headers: { Origin: origin, Cookie: this.cookie, 'X-CSRF-Token': this.csrf, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    assert.equal(response.status, status, `${method} ${route}: ${JSON.stringify(result)}`);
    if (response.headers.get('set-cookie')) this.cookie = response.headers.get('set-cookie').split(';')[0];
    if (result.csrf) this.csrf = result.csrf;
    return result;
  } };
}
try {
  await start();
  const admin = client(), a = client(), b = client(), anonymous = client();
  const hash = await hashPassword(password), at = service.store.now();
  service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)', 'popup-admin', 'popup-admin@example.test', hash, '비공개 관리자 이름', 'admin', at, at);
  await admin.call('/auth/login', { method: 'POST', body: { email: 'popup-admin@example.test', password } });
  const register = (who, email) => who.call('/auth/register', { method: 'POST', status: 201, body: { email, password, name: '개인 이름 <script>unsafe</script>', adult: true, terms: true, privacy: true } });
  const userA = (await register(a, 'popup-a@example.test')).user, userB = (await register(b, 'popup-b@example.test')).user;
  for (const endpoint of ['/welcome-popup', '/community/summary', '/admin/welcome-popup']) await anonymous.call(endpoint, { status: 401 });
  await a.call('/admin/welcome-popup', { status: 403 });
  await a.call('/admin/welcome-popup', { method: 'PATCH', body: { version: 1 }, status: 403 });
  const initial = (await a.call('/welcome-popup')).popup;
  assert.equal(initial.enabled, true); assert.equal(initial.frequency, 'once'); assert.equal(initial.ctaPath, '#education');
  await a.call('/welcome-popup/seen', { method: 'POST', body: { version: initial.version }, headers: { 'X-CSRF-Token': 'bad' }, status: 403 });
  await a.call('/welcome-popup/seen', { method: 'POST', body: { version: initial.version } });
  assert.equal((await a.call('/welcome-popup')).popup, null);
  assert.equal((await b.call('/welcome-popup')).popup.version, initial.version);
  await service.close(); await start();
  assert.equal((await a.call('/welcome-popup')).popup, null, 'seen record survives restart');
  let config = (await admin.call('/admin/welcome-popup')).popup;
  const save = async patch => { config = (await admin.call('/admin/welcome-popup', { method: 'PATCH', body: { ...config, ...patch } })).popup; return config; };
  await admin.call('/admin/welcome-popup', { method: 'PATCH', body: { ...config, title: 'changed' }, headers: { Origin: 'https://evil.test' }, status: 403 });
  for (const patch of [{ imageUrl: 'javascript:alert(1)' }, { imageUrl: 'data:image/svg+xml,<svg/>' }, { imageUrl: 'http://example.test/image.png' }, { imageUrl: '//example.test/image.png' }, { ctaPath: 'https://evil.test' }, { ctaPath: '#../../admin' }, { frequency: 'always' }, { enabled: 'true' }, { startsAt: '2026-10-12T00:00:00Z', endsAt: '2026-10-11T00:00:00Z' }]) await admin.call('/admin/welcome-popup', { method: 'PATCH', body: { ...config, ...patch }, status: 400 });
  const oldVersion = config.version;
  await save({ frequency: 'daily', title: '<script>plain text</script>', body: '줄바꿈\n안내' });
  await admin.call('/admin/welcome-popup', { method: 'PATCH', body: { ...config, version: oldVersion }, status: 409 });
  assert.equal((await a.call('/welcome-popup')).popup.title, '<script>plain text</script>');
  const popup = createWelcomePopupService(service.store), testSession = { token: 'test-session-hash' };
  popup.seen(userA, testSession, { version: config.version }, new Date('2026-10-10T14:59:00Z'));
  assert.equal(popup.eligible(userA, testSession, new Date('2026-10-10T14:59:30Z')), null);
  assert.ok(popup.eligible(userA, testSession, new Date('2026-10-10T15:00:00Z')), 'daily boundary is midnight Korea');
  await save({ frequency: 'session' });
  popup.seen(userA, { token: 'one' }, { version: config.version });
  popup.seen(userA, { token: 'two' }, { version: config.version });
  assert.equal(popup.eligible(userA, { token: 'one' }), null, 'concurrent sessions each retain their own seen record');
  assert.equal(popup.eligible(userA, { token: 'two' }), null);
  assert.ok(popup.eligible(userA, { token: 'three' }));
  await save({ enabled: false }); assert.equal((await b.call('/welcome-popup')).popup, null);
  await save({ enabled: true, startsAt: '2999-01-01T00:00:00Z' }); assert.equal((await b.call('/welcome-popup')).popup, null);
  await save({ startsAt: null, endsAt: '2000-01-01T00:00:00Z' }); assert.equal((await b.call('/welcome-popup')).popup, null);
  await save({ endsAt: null, frequency: 'once' }); assert.ok((await a.call('/welcome-popup')).popup);

  const empty = await a.call('/community/summary');
  assert.deepEqual(empty.leaders, []); assert.equal(empty.me.rank, null); assert.equal(empty.total.participantCount, 0);
  let sequence = 0;
  const ledger = (userId, amount, kind = 'reward') => { const id = `popup-ledger-${++sequence}`; service.store.run('INSERT INTO ledger VALUES(?,?,?,?,?,?)', id, userId, amount, kind, id, at); };
  const video = (userId, duration, status = 'approved') => { const id = `popup-video-${++sequence}`; service.store.run('INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,path,sha,status,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, userId, 'dishwashing', 'private', 'private.mp4', 'video/mp4', 1, duration, 100, 100, 3000, id, id, status, at); };
  ledger(userA.id, 6000); ledger(userA.id, -1000, 'purchase'); ledger(userA.id, 123456, 'refund'); video(userA.id, 60); video(userA.id, 120); video(userA.id, 999, 'rejected');
  ledger(userB.id, 6000); video(userB.id, 60); ledger('popup-admin', 999999);
  for (let index = 0; index < 12; index++) { const id = `anonymous-${index}`; service.store.run('INSERT INTO users(id,email,password,name,createdAt,updatedAt,status) VALUES(?,?,?,?,?,?,?)', id, `${id}@example.test`, hash, `private-name-${index}`, at, at, index === 11 ? 'suspended' : 'active'); ledger(id, index === 11 ? 999999 : 100 + index); }
  const summary = await a.call('/community/summary');
  assert.equal(summary.leaders.length, 10); assert.equal(summary.leaders[0].rank, 1); assert.equal(summary.leaders[1].rank, 1); assert.equal(summary.leaders[2].rank, 2);
  assert.equal(summary.me.points, 6000); assert.equal(summary.me.approvedVideoCount, 2); assert.equal(summary.me.approvedSeconds, 180); assert.equal(summary.me.rank, 1);
  assert.equal(summary.total.approvedPoints, 13155); assert.equal(summary.total.approvedSeconds, 240); assert.equal(summary.total.participantCount, 13);
  const serialized = JSON.stringify(summary); assert.doesNotMatch(serialized, /@example|private-name|popup-admin|anonymous-|userId|email|phone|개인 이름/);
  for (const leader of summary.leaders) assert.deepEqual(Object.keys(leader).sort(), ['approvedSeconds', 'approvedVideoCount', 'isMe', 'label', 'points', 'rank']);
  assert.ok(service.store.one("SELECT id FROM audit WHERE action='welcome-popup.update'"));
  console.log('Welcome popup/community passed: auth, CSRF, strict config, version conflicts, Korea daily/session frequency, duration, restart, real reward-only ranking, anonymity and empty state.');
} finally { if (service) await service.close(); await rm(directory, { recursive: true, force: true }); }
