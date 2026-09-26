import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/app.mjs';
import { createHfState } from '../server/hf-state.mjs';
import { createHfMedia } from '../server/hf-media.mjs';
import { createHfStorage } from '../server/hf-storage.mjs';
import { hashPassword } from '../server/security.mjs';
import { loadConnectionEnv } from './hf-readiness.mjs';

export async function liveOperations({ write = false, env = {}, storageFactory = createHfStorage } = {}) {
  const report = { ok: true, writeEnabled: write === true, checks: [], cleanup: { remote: true, local: true } };
  if (write !== true) {
    report.checks.push({ name: 'operations smoke skipped; pass --write to execute', ok: true });
    return report;
  }
  const prefix = `connection-checks/${randomUUID()}/`;
  report.prefix = prefix;
  const owned = new Set(), directories = [];
  const stateKey = randomBytes(32).toString('base64'), gatewayKey = randomBytes(32).toString('hex');
  // This configured logical origin is carried explicitly by our HTTP client.
  // The transport binds a random loopback port on each ephemeral restart.
  const origin = 'http://127.0.0.1';
  let storage, service, base, stage = 'configuration';
  const pass = () => report.checks.push({ name: stage, ok: true });
  const fail = name => { report.ok = false; report.checks.push({ name, ok: false, error: 'Operations smoke check failed' }); };
  const remoteKey = key => {
    if (!/^(system\/checkpoint\.bin|staging\/up_[a-f0-9]{24}\/\d+|videos\/vid_[a-f0-9]{24})$/.test(key)) throw Error('Unexpected isolated object');
    return prefix + key;
  };
  async function stop() {
    if (!service) return;
    service.server.closeAllConnections();
    await service.close();
    service = null;
  }
  function client() {
    return { cookie: '', csrf: '', async call(route, { method = 'GET', body, raw, status = 200, range } = {}) {
      const headers = { Origin: origin, Cookie: this.cookie, 'X-CSRF-Token': this.csrf, 'X-Dongjakso-Gateway-Key': gatewayKey };
      if (body) headers['Content-Type'] = 'application/json';
      if (range) headers.Range = range;
      const response = await fetch(`${base}/api${route}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(120_000), redirect: 'error' });
      assert.equal(response.status, status, 'Unexpected operations HTTP status');
      const cookie = response.headers.get('set-cookie');
      if (cookie) this.cookie = cookie.split(';')[0];
      if (range) return { response, bytes: Buffer.from(await response.arrayBuffer()) };
      const payload = await response.json();
      if (payload.csrf) this.csrf = payload.csrf;
      return payload;
    } };
  }
  try {
    for (const name of ['HF_BUCKET_ID', 'HF_S3_ACCESS_KEY_ID', 'HF_S3_SECRET_ACCESS_KEY']) {
      if (typeof env[name] !== 'string' || !env[name]) throw Error('Missing configuration');
    }
    storage = storageFactory({ bucket: env.HF_BUCKET_ID, accessKeyId: env.HF_S3_ACCESS_KEY_ID, secretAccessKey: env.HF_S3_SECRET_ACCESS_KEY });
    async function put(method, key, value, options = {}) {
      const full = remoteKey(key), existing = owned.has(full);
      if (!existing && options.ifNoneMatch !== '*') throw Error('Initial write must be conditional');
      owned.add(full);
      try { return await storage[method](full, value, options); }
      catch (error) {
        if (!existing && [409, 412].includes(error.status)) owned.delete(full);
        throw error;
      }
    }
    const scoped = {
      put: (key, value, options) => put('put', key, value, options),
      putFile: (key, value, options) => put('putFile', key, value, options),
      get: (key, options) => storage.get(remoteKey(key), options),
      head: key => storage.head(remoteKey(key)),
      remove: key => {
        const full = remoteKey(key);
        if (!owned.has(full)) throw Error('Refusing to remove unowned object');
        return storage.remove(full);
      },
    };
    async function start(initialize = false) {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'hf-live-operations-'));
      directories.push(directory);
      const state = createHfState({ storage: scoped, directory, encryptionKey: stateKey, allowInitialize: initialize });
      assert.equal(await state.restore(), !initialize);
      const media = createHfMedia({ storage: scoped, checkpoint: store => state.checkpoint(store), assertCurrent: () => state.assertCurrent() });
      service = createService({ directory, origin, persistence: state, media, gatewayKey });
      await state.checkpoint(service.store);
      await service.maintenance();
      await new Promise((resolve, reject) => { service.server.once('error', reject); service.server.listen(0, '127.0.0.1', resolve); });
      base = `http://127.0.0.1:${service.server.address().port}`;
    }
    stage = 'isolated runtime and synthetic accounts';
    await start(true);
    const password = `Synthetic-${randomBytes(24).toString('hex')}`;
    const now = service.store.now();
    service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt,forcePassword) VALUES(?,?,?,?,?,?,?,?)', 'smoke-admin', 'admin@example.test', await hashPassword(password), 'Smoke Admin', 'admin', now, now, 0);
    const admin = client(), member = client();
    await admin.call('/auth/login', { method: 'POST', body: { email: 'admin@example.test', password } });
    await member.call('/auth/register', { method: 'POST', status: 201, body: { email: 'member@example.test', password, name: 'Smoke Member', terms: true, privacy: true, adult: true } });
    const memberId = (await member.call('/session')).user.id;
    assert.equal(service.store.one('SELECT COUNT(*) n FROM users').n, 2);
    pass();
    stage = 'real footage chunk upload, remote media and authenticated Range';
    const footage = await readFile(new URL('../assets/videos/collection/folding-clothes.mp4', import.meta.url));
    const upload = await member.call('/uploads', { method: 'POST', status: 201, body: { taskId: 'folding-clothes', title: 'Synthetic storage verification', filename: 'smoke.mp4', size: footage.length, mime: 'video/mp4', duration: 300, width: 1920, height: 1080 } });
    assert.equal(upload.chunkSize, 2097152);
    for (let offset = 0; offset < footage.length; offset += upload.chunkSize) {
      await member.call(`/uploads/${upload.id}?offset=${offset}`, { method: 'PUT', raw: footage.subarray(offset, offset + upload.chunkSize) });
      assert.ok((await scoped.head(`staging/${upload.id}/${offset}`)).size > 0);
    }
    const completed = await member.call(`/uploads/${upload.id}/complete`, { method: 'POST', status: 201, body: {} });
    const videoId = completed.id;
    const remote = await scoped.get(`videos/${videoId}`);
    const hasher = createHash('sha256');
    for await (const chunk of remote.body) hasher.update(chunk);
    assert.equal(hasher.digest('hex'), createHash('sha256').update(footage).digest('hex'));
    async function rangeCheck(start) {
      const range = await member.call(`/videos/${videoId}/file`, { status: 206, range: `bytes=${start}-${start + 63}` });
      assert.equal(range.response.headers.get('content-range'), `bytes ${start}-${start + 63}/${footage.length}`);
      assert.equal(range.bytes.equals(footage.subarray(start, start + 64)), true);
    }
    await rangeCheck(0);
    pass();
    stage = 'submission and approval produce exactly one reward';
    await member.call(`/videos/${videoId}/submit`, { method: 'POST', body: { filming: true, privacy: true, usage: true, training: true, recordedInKorea: true } });
    const video = (await admin.call('/admin/data')).videos.find(row => row.id === videoId);
    const review = { stage: 'client', decision: 'approved', revision: video.revision, checks: { framing: true, hands: true, privacy: true, completion: true } };
    for (const stage of ['ai', 'manual', 'client']) await admin.call(`/admin/videos/${videoId}/review`, { method: 'POST', body: { ...review, stage } });
    await admin.call(`/admin/videos/${videoId}/review`, { method: 'POST', status: 409, body: review });
    assert.equal((await member.call('/me')).wallet.earned, 3000);
    assert.equal(service.store.one('SELECT COUNT(*) n FROM ledger WHERE userId=?', memberId).n, 1);
    pass();
    stage = 'fresh runtime restores users, video, session and single reward';
    await stop();
    await start();
    assert.equal((await member.call('/session')).user.id, memberId);
    assert.equal(service.store.one('SELECT COUNT(*) n FROM users').n, 2);
    assert.equal(service.store.one('SELECT status FROM videos WHERE id=?', videoId).status, 'approved');
    assert.equal(service.store.one('SELECT COUNT(*) n FROM ledger WHERE userId=?', memberId).n, 1);
    assert.equal((await member.call('/me')).wallet.earned, 3000);
    await rangeCheck(64);
    pass();
    stage = 'admin deletion removes isolated video and clears cleanup job';
    await admin.call(`/admin/videos/${videoId}/remove`, { method: 'POST', body: { reason: 'Synthetic smoke cleanup', confirm: videoId } });
    await service.maintenance();
    assert.equal(service.store.one('SELECT status FROM videos WHERE id=?', videoId).status, 'deleted');
    assert.equal(service.store.one('SELECT COUNT(*) n FROM cleanup_jobs WHERE videoId=?', videoId).n, 0);
    await assert.rejects(scoped.head(`videos/${videoId}`), error => error.status === 404);
    pass();
  } catch {
    fail(stage);
  } finally {
    try { await stop(); } catch { report.cleanup.local = false; }
    for (const key of owned) {
      try {
        await storage.remove(key);
        await assert.rejects(storage.head(key), error => error.status === 404);
      } catch { report.cleanup.remote = false; }
    }
    for (const directory of directories) {
      try { await rm(directory, { recursive: true, force: true }); }
      catch { report.cleanup.local = false; }
    }
    if (!report.cleanup.remote || !report.cleanup.local) fail('temporary operations cleanup');
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const write = process.argv.slice(2).includes('--write');
    const report = await liveOperations({ write, env: write ? await loadConnectionEnv() : {} });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch {
    console.log(JSON.stringify({ ok: false, error: 'Unable to prepare the isolated operations check' }));
    process.exitCode = 1;
  }
}
