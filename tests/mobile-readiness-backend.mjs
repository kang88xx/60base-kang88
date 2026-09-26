import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/app.mjs';
import { createPlaybackLeases } from '../server/playback-leases.mjs';
import { digest } from '../server/security.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), '60base-mobile-api-'));
const origin = 'http://localhost:4499';
const service = createService({ directory, origin });
const { store } = service;
const at = store.now();
for (const [id, role] of [['member', 'member'], ['other', 'member'], ['admin', 'admin']]) {
  store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)', id, `${id}@example.test`, 'not-a-real-password', id, role, at, at);
  store.run('INSERT INTO sessions VALUES(?,?,?,?,?)', digest(`test-${id}`), id, `csrf-${id}`, Date.now() + 3600000, Date.now());
}
const bytes = Buffer.from([0, 1, 2, 254, 255, 80, 90, 0, 10, 200]);
await writeFile(path.join(directory, 'videos', 'video1'), bytes);
store.run('INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,path,sha,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', 'video1', 'member', 'dishwashing', 'test', 'test.mp4', 'video/mp4', bytes.length, 300, 640, 480, 3000, 'video1', 'sha1', at);
await new Promise(resolve => service.server.listen(4499, '127.0.0.1', resolve));
async function call(route, { user = 'member', method = 'GET', body, headers = {}, status = 200 } = {}) {
  const response = await fetch(origin + route, { method, headers: { Origin: origin, Cookie: `dongjakso_session=test-${user}`, 'X-CSRF-Token': `csrf-${user}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  assert.equal(response.status, status, `${method} ${route}: ${await response.clone().text()}`);
  return response;
}
try {
  await call('/app/native.js');
  await call('/studio/delete-account.html');
  await call('/mobile/capacitor.config.json', { status: 404 });
  await call('/api/account/deletion', { user: 'guest', status: 401 });
  await call('/api/account/deletion', { method: 'POST', body: {}, status: 400 });
  await call('/api/account/deletion', { method: 'POST', body: { confirm: 'DELETE' }, headers: { 'X-CSRF-Token': 'invalid' }, status: 403 });
  const request = await (await call('/api/account/deletion', { method: 'POST', body: { confirm: 'DELETE', userId: 'other' }, status: 202 })).json();
  assert.equal(request.deletion.status, 'pending');
  const duplicate = await (await call('/api/account/deletion', { method: 'POST', body: { confirm: 'DELETE' }, status: 202 })).json();
  assert.equal(duplicate.deletion.id, request.deletion.id);
  assert.equal((await (await call('/api/account/deletion', { user: 'other' })).json()).deletion, null);
  await call('/api/admin/account-deletions', { status: 403 });
  await call(`/api/admin/account-deletions/${request.deletion.id}/process`, { user: 'admin', method: 'POST', body: {}, status: 400 });
  const blocked = await (await call(`/api/admin/account-deletions/${request.deletion.id}/process`, { user: 'admin', method: 'POST', body: { confirm: request.deletion.id } })).json();
  assert.equal(blocked.deletion.status, 'blocked');
  assert.equal(store.one("SELECT status FROM users WHERE id='member'").status, 'active');
  await call('/api/videos/video1/playback', { user: 'other', method: 'POST', body: {}, status: 404 });
  const lease = await (await call('/api/videos/video1/playback', { method: 'POST', body: {}, status: 201 })).json();
  assert.ok(lease.expiresAt > Date.now() + 30 * 60000);
  const playback = new URL(lease.url);
  const range = await fetch(playback, { headers: { Range: 'bytes=2-6' } });
  assert.equal(range.status, 206);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(2, 7));
  assert.match(range.headers.get('cache-control'), /no-store/);
  assert.equal(range.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal(range.headers.get('referrer-policy'), 'no-referrer');
  const head = await fetch(playback, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await fetch(lease.url.replace('/video1/', '/other/'))).status, 401);
  await call('/api/auth/logout', { method: 'POST', body: {} });
  assert.equal((await fetch(playback)).status, 401);
  let clock = Date.now();
  const manager = createPlaybackLeases(store, { now: () => clock, ttlMs: 10 });
  const user = store.one("SELECT * FROM users WHERE id='member'"), video = store.one("SELECT * FROM videos WHERE id='video1'");
  const token = manager.issue(user, { userId: user.id, token: 'unused', expiresAt: clock + 1000 }, video).token;
  clock += 11;
  assert.throws(() => manager.resolve(token, video.id), error => error.status === 401);
  console.log('PASS deletion routes: ownership, confirmation, CSRF, idempotency, last-stage failure safety; playback: ownership, bytes/range, HEAD, scope, logout and expiry; public source boundary.');
} finally { await service.close(); await rm(directory, { recursive: true, force: true }); }
