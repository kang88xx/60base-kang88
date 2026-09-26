import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHfStorage } from '../server/hf-storage.mjs';
import { createHfState } from '../server/hf-state.mjs';
import { openDatabase } from '../server/database.mjs';
import { loadConnectionEnv } from './hf-readiness.mjs';

export async function liveSmoke({ write = false, env = {}, storageFactory = createHfStorage } = {}) {
  const report = { ok: true, writeEnabled: write === true, checks: [], cleanup: { remote: true, local: true } };
  if (write !== true) {
    report.checks.push({ name: 'write smoke skipped; pass --write to execute', ok: true });
    return report;
  }
  const prefix = `connection-checks/${randomUUID()}/`;
  report.prefix = prefix;
  const pending = new Set(), directories = [], databases = [];
  let storage, stage = 'configuration';
  const check = name => report.checks.push({ name, ok: true });
  const failure = name => { report.ok = false; report.checks.push({ name, ok: false, error: 'Smoke check failed' }); };
  const keyFor = key => {
    if (!['probe.bin', 'system/checkpoint.bin'].includes(key)) throw Error('Unexpected smoke object');
    return prefix + key;
  };
  try {
    for (const name of ['HF_BUCKET_ID', 'HF_S3_ACCESS_KEY_ID', 'HF_S3_SECRET_ACCESS_KEY']) {
      if (typeof env[name] !== 'string' || !env[name]) throw Error('Missing configuration');
    }
    storage = storageFactory({ bucket: env.HF_BUCKET_ID, accessKeyId: env.HF_S3_ACCESS_KEY_ID, secretAccessKey: env.HF_S3_SECRET_ACCESS_KEY });
    const scoped = {
      async put(key, body, options = {}) {
        const full = keyFor(key), owned = pending.has(full);
        if (!owned && options.ifNoneMatch !== '*') throw Error('Initial write must be conditional');
        // Include uncertain writes in cleanup, but never delete a rejected existing object.
        pending.add(full);
        try { return await storage.put(full, body, options); }
        catch (error) {
          if (!owned && [409, 412].includes(error.status)) pending.delete(full);
          throw error;
        }
      },
      get: (key, options) => storage.get(keyFor(key), options),
      head: key => storage.head(keyFor(key)),
    };
    const first = Buffer.from('synthetic HF connection check 0123456789');
    const second = Buffer.from('synthetic replacement connection check');
    stage = 'put, head, full read and Range read';
    const initial = await scoped.put('probe.bin', first, { ifNoneMatch: '*' });
    assert.ok(initial.etag);
    const head = await scoped.head('probe.bin');
    assert.equal(head.etag, initial.etag);
    assert.equal(head.size, first.length);
    const full = await scoped.get('probe.bin');
    assert.equal(full.status, 200);
    assert.equal(Buffer.from(await full.arrayBuffer()).equals(first), true);
    const partial = await scoped.get('probe.bin', { range: 'bytes=3-9' });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), `bytes 3-9/${first.length}`);
    assert.equal(Buffer.from(await partial.arrayBuffer()).equals(first.subarray(3, 10)), true);
    check(stage);
    stage = 'conditional create rejects existing object';
    await assert.rejects(scoped.put('probe.bin', second, { ifNoneMatch: '*' }), error => [409, 412].includes(error.status));
    check(stage);
    stage = 'conditional replace succeeds and stale ETag is rejected';
    const replacement = await scoped.put('probe.bin', second, { ifMatch: initial.etag });
    assert.ok(replacement.etag && replacement.etag !== initial.etag);
    await assert.rejects(scoped.put('probe.bin', first, { ifMatch: initial.etag }), error => [409, 412].includes(error.status));
    assert.equal(Buffer.from(await (await scoped.get('probe.bin')).arrayBuffer()).equals(second), true);
    check(stage);
    stage = 'isolated encrypted SQLite checkpoint restores synthetic state';
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hf-live-smoke-'));
    directories.push(directory);
    const key = randomBytes(32).toString('base64');
    const state = createHfState({ storage: scoped, directory, encryptionKey: key, allowInitialize: true });
    // Existing content under our random prefix is never overwritten.
    assert.equal(await state.restore(), false);
    const store = openDatabase(directory);
    databases.push(store.db);
    const marker = `synthetic-${randomUUID()}`;
    store.run('INSERT INTO settings(key,value) VALUES(?,?)', 'connectionSmoke', JSON.stringify(marker));
    await state.checkpoint(store);
    const encrypted = Buffer.from(await (await scoped.get('system/checkpoint.bin')).arrayBuffer());
    assert.equal(encrypted.includes(Buffer.from(marker)), false);
    assert.equal(encrypted.includes(await readFile(path.join(directory, 'encryption.key'))), false);
    const restoredDirectory = await mkdtemp(path.join(os.tmpdir(), 'hf-live-smoke-'));
    directories.push(restoredDirectory);
    const restoredState = createHfState({ storage: scoped, directory: restoredDirectory, encryptionKey: key });
    assert.equal(await restoredState.restore(), true);
    const restored = openDatabase(restoredDirectory);
    databases.push(restored.db);
    assert.equal(restored.one('SELECT value FROM settings WHERE key=?', 'connectionSmoke').value, JSON.stringify(marker));
    assert.equal(restored.one('SELECT COUNT(*) n FROM users').n, 0);
    check(stage);
  } catch {
    failure(stage);
  } finally {
    for (const db of databases) {
      try { db.close(); } catch { report.cleanup.local = false; }
    }
    for (const key of pending) {
      try {
        await storage.remove(key);
        await assert.rejects(storage.head(key), error => error.status === 404);
      } catch { report.cleanup.remote = false; }
    }
    for (const directory of directories) {
      try { await rm(directory, { recursive: true, force: true }); }
      catch { report.cleanup.local = false; }
    }
    if (!report.cleanup.remote || !report.cleanup.local) failure('temporary object cleanup');
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const write = process.argv.slice(2).includes('--write');
    const report = await liveSmoke({ write, env: write ? await loadConnectionEnv() : {} });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch {
    console.log(JSON.stringify({ ok: false, error: 'Unable to prepare the Hugging Face smoke check' }));
    process.exitCode = 1;
  }
}
