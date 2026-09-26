import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultCredentialsFile, listen } from '../tools/hf-connect.mjs';

assert.equal(defaultCredentialsFile({}, '/Users/test'), '/Users/test/.local/share/dongjakso-hf/credentials.json');
assert.equal(defaultCredentialsFile({ HF_CREDENTIALS_FILE: '/tmp/custom.json' }, '/unused'), '/tmp/custom.json');
const dir = await mkdtemp(path.join(os.tmpdir(), 'hf-connect-test-'));
const servers = [];
const credentials = { hfToken: 'hf_' + 'A'.repeat(40), hfS3AccessKeyId: 'HFAK' + 'B'.repeat(20), hfS3SecretAccessKey: 'C'.repeat(40), namespace: '' };
let identity = { name: 'account', isPro: true, auth: { accessToken: { role: 'write' } } };
let responseStatus = 200;
let calls = 0;
const storeFile = path.join(dir, 'private', 'credentials.json');
const start = async file => {
  const instance = await listen({ port: 0, storeFile: file, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://huggingface.co/api/whoami-v2');
    assert.equal(options.headers.Authorization, `Bearer ${credentials.hfToken}`);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(identity), { status: responseStatus });
  } });
  servers.push(instance.server);
  return instance;
};
const post = (instance, data = credentials, headers = {}) => fetch(instance.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HF-Connect-Nonce': instance.server.connectNonce, ...headers }, body: JSON.stringify(data) });
const checkSecretFree = text => { for (const key of ['hfToken', 'hfS3AccessKeyId', 'hfS3SecretAccessKey']) assert.ok(!text.includes(credentials[key])); };
try {
  const instance = await start(storeFile);
  const page = await fetch(instance.url);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  checkSecretFree(await page.text());
  assert.equal((await fetch(new URL('/', instance.url))).status, 404);
  assert.equal((await post(instance, credentials, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await post(instance, credentials, { 'X-HF-Connect-Nonce': 'wrong' })).status, 403);
  assert.equal((await post(instance, { ...credentials, hfToken: 'bad' })).status, 400);
  assert.equal(calls, 0);
  responseStatus = 401;
  assert.equal((await (await post(instance)).json()).error, 'token_rejected');
  responseStatus = 200;
  identity.isPro = false;
  assert.equal((await (await post(instance)).json()).error, 'pro_required');
  identity.isPro = true;
  for (const role of ['read', undefined, 'unknown']) {
    identity.auth.accessToken.role = role;
    assert.equal((await (await post(instance)).json()).error, 'token_not_write');
  }
  await assert.rejects(readFile(storeFile), { code: 'ENOENT' });
  identity.auth.accessToken.role = 'write';
  const savedResponse = await post(instance);
  assert.equal(savedResponse.status, 200);
  checkSecretFree(await savedResponse.text());
  const record = JSON.parse(await readFile(storeFile, 'utf8'));
  assert.equal(record.hfToken, credentials.hfToken);
  assert.equal(record.namespace, 'account');
  assert.equal(record.verified.permissionsVerified, true);
  assert.equal((await stat(storeFile)).mode & 0o777, 0o600);
  assert.equal((await stat(path.dirname(storeFile))).mode & 0o777, 0o700);
  assert.deepEqual(await readdir(path.dirname(storeFile)), ['credentials.json']);
  const resumed = await start(storeFile);
  assert.notEqual(resumed.server.connectNonce, instance.server.connectNonce);
  const restored = await (await fetch(resumed.url + '/status')).text();
  assert.equal(JSON.parse(restored).account, 'account');
  checkSecretFree(restored);
  const isolated = await start(path.join(dir, 'other.json'));
  const emptyStatus = await (await fetch(isolated.url + '/status')).json();
  assert.equal(emptyStatus.configured, false);
  assert.equal(emptyStatus.error, undefined);
  for (const [name, content] of [['malformed', '{' + credentials.hfToken], ['invalid', '{}'], ['unverified', JSON.stringify({ ...record, verified: {} })]]) {
    const invalidFile = path.join(dir, name + '.json');
    await writeFile(invalidFile, content, { mode: 0o600 });
    const damaged = await start(invalidFile);
    const statusText = await (await fetch(damaged.url + '/status')).text();
    const damagedStatus = JSON.parse(statusText);
    assert.equal(damagedStatus.configured, false);
    assert.equal(damagedStatus.error, 'credentials_unreadable');
    checkSecretFree(statusText);
    assert.equal(await readFile(invalidFile, 'utf8'), content);
    const replaced = await post(damaged);
    assert.equal(replaced.status, 200);
    assert.equal((await (await fetch(damaged.url + '/status')).json()).error, undefined);
  }
  const unreadable = await start(dir);
  assert.equal((await (await fetch(unreadable.url + '/status')).json()).error, 'credentials_unreadable');
  identity.auth.accessToken.role = 'fineGrained';
  assert.equal((await post(instance)).status, 200);
  assert.equal(JSON.parse(await readFile(storeFile, 'utf8')).verified.permissionsVerified, false);
  console.log('hf-connect: portable paths, isolated sessions, private atomic save, rejection checks, and saved-status secrecy passed');
} finally {
  for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(dir, { recursive: true, force: true });
}
