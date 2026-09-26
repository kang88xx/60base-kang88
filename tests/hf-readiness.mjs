import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readiness, loadConnectionEnv } from '../scripts/hf-readiness.mjs';

const env = {
  HF_TOKEN: 'hf_test_sensitive_token', HF_BUCKET_ID: 'owner/video-bucket', HF_SPACE_ID: 'owner/operations',
  HF_S3_ACCESS_KEY_ID: 'sensitive-access-key', HF_S3_SECRET_ACCESS_KEY: 'sensitive-secret-key',
  HF_STATE_KEY: Buffer.alloc(32, 7).toString('base64'), DONGJAKSO_GATEWAY_KEY: 'sensitive-gateway-key'.repeat(2),
  DONGJAKSO_ORIGIN: 'https://60base.ai', PUBLIC_FIREBASE_PROJECT_ID: 'test-project',
};
const metadata = {
  '/api/whoami-v2': { name: 'owner', isPro: true },
  '/api/buckets/owner/video-bucket': { id: env.HF_BUCKET_ID, private: true },
  '/api/spaces/owner/operations': { id: env.HF_SPACE_ID, private: true, sdk: 'docker' },
};
const checks = [], failures = [];
async function test(name, action) {
  try { await action(); checks.push(name); }
  catch (error) { failures.push({ name, error: error.message }); }
}
function mock(overrides = {}, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    const route = new URL(url).pathname;
    assert.ok(Object.hasOwn(metadata, route), `unexpected API route ${route}`);
    return Response.json({ ...metadata[route], ...overrides[route] });
  };
}
function noSecrets(value) {
  const text = JSON.stringify(value);
  for (const key of ['HF_TOKEN', 'HF_S3_ACCESS_KEY_ID', 'HF_S3_SECRET_ACCESS_KEY', 'HF_STATE_KEY', 'DONGJAKSO_GATEWAY_KEY']) {
    assert.equal(text.includes(env[key]), false, `${key} must not appear in output`);
  }
}

await test('valid PRO account and private Docker resources use namespace/name API routes', async () => {
  const calls = [];
  const report = await readiness({ env, fetchImpl: mock({}, calls) });
  assert.equal(report.ok, true);
  assert.deepEqual(calls.map(call => call.url), Object.keys(metadata).map(route => `https://huggingface.co${route}`));
  assert.equal(report.checks.length, 3);
  for (const { options } of calls) {
    assert.equal(options.headers.Authorization, `Bearer ${env.HF_TOKEN}`);
    assert.equal(options.redirect, 'error');
  }
  noSecrets(report);
});

for (const [name, route, patch] of [
  ['non-PRO account', '/api/whoami-v2', { isPro: false }],
  ['unidentified account', '/api/whoami-v2', { name: '' }],
  ['public bucket', '/api/buckets/owner/video-bucket', { private: false }],
  ['wrong bucket identity', '/api/buckets/owner/video-bucket', { id: 'other/bucket' }],
  ['public Space', '/api/spaces/owner/operations', { private: false }],
  ['non-Docker Space', '/api/spaces/owner/operations', { sdk: 'gradio' }],
  ['wrong Space identity', '/api/spaces/owner/operations', { id: 'other/space' }],
]) await test(`rejects ${name}`, async () => {
  const report = await readiness({ env, fetchImpl: mock({ [route]: patch }) });
  assert.equal(report.ok, false);
  assert.equal(report.checks.filter(check => !check.ok).length, 1);
  noSecrets(report);
});

await test('missing configuration is reported without network access', async () => {
  const report = await readiness({ env: {}, fetchImpl: () => assert.fail('network must not run') });
  assert.equal(report.ok, false);
  assert.equal(report.checks.length, Object.keys(env).length);
  assert.ok(Object.values(report.env).every(value => value === false));
});
for (const [name, patch] of [
  ['invalid state key', { HF_STATE_KEY: 'bad-key' }],
  ['noncanonical state key', { HF_STATE_KEY: `${env.HF_STATE_KEY}\n` }],
  ['short gateway key', { DONGJAKSO_GATEWAY_KEY: 'short' }],
  ['legacy origin is not canonical', { DONGJAKSO_ORIGIN: 'https://60base.kr' }],
  ['wrong origin', { DONGJAKSO_ORIGIN: 'https://example.test' }],
  ['initialization without admin', { HF_INITIALIZE: '1' }],
  ['malformed bucket ID', { HF_BUCKET_ID: 'owner/bucket/extra' }],
  ['encoded resource path', { HF_SPACE_ID: 'owner%2Foperations' }],
]) await test(`rejects ${name}`, async () => {
  const report = await readiness({ env: { ...env, ...patch }, fetchImpl: mock() });
  assert.equal(report.ok, false);
});
await test('initialization accepts supplied admin credentials without disclosing password', async () => {
  const password = 'sensitive-admin-password';
  const report = await readiness({ env: { ...env, HF_INITIALIZE: '1', DONGJAKSO_ADMIN_EMAIL: 'admin@example.test', DONGJAKSO_ADMIN_PASSWORD: password }, fetchImpl: mock() });
  assert.equal(report.ok, true);
  assert.equal(JSON.stringify(report).includes(password), false);
});
await test('HTTP errors omit response bodies and secrets', async () => {
  const report = await readiness({ env, fetchImpl: async () => new Response(env.HF_TOKEN, { status: 403 }) });
  assert.equal(report.ok, false);
  assert.ok(report.checks.every(check => check.error === 'HF API returned 403'));
  noSecrets(report);
});
await test('network and redirect errors cannot inject public messages containing credentials', async () => {
  const report = await readiness({ env, fetchImpl: async () => { throw Object.assign(new Error(env.HF_TOKEN), { publicMessage: env.HF_TOKEN }); } });
  assert.equal(report.ok, false);
  noSecrets(report);
});
await test('malformed API JSON fails safely', async () => {
  const report = await readiness({ env, fetchImpl: async () => new Response(env.HF_TOKEN) });
  assert.equal(report.ok, false);
  noSecrets(report);
});
await test('unresponsive API request aborts within the 15 second request deadline', async () => {
  const started = Date.now();
  const keepAlive = setTimeout(() => {}, 20_000);
  try {
    const report = await readiness({ env: { HF_TOKEN: env.HF_TOKEN }, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }) });
    assert.ok(Date.now() - started < 19_000, 'request deadline must bound an unresponsive fetch');
    assert.equal(report.checks.find(check => check.name === 'whoami-v2').ok, false);
    noSecrets(report);
  } finally { clearTimeout(keepAlive); }
});

const directory = await mkdtemp(path.join(os.tmpdir(), 'hf-readiness-test-'));
const file = path.join(directory, 'credentials.json');
try {
  await test('missing local credentials file preserves supplied environment', async () => {
    const input = { HF_CREDENTIALS_FILE: file, HF_TOKEN: env.HF_TOKEN };
    assert.deepEqual(await loadConnectionEnv(input), input);
  });
  await test('local saved credentials fill only missing environment values', async () => {
    await writeFile(file, JSON.stringify({ hfToken: 'saved-token', hfS3AccessKeyId: 'saved-access', hfS3SecretAccessKey: 'saved-secret' }));
    const input = { HF_CREDENTIALS_FILE: file, HF_TOKEN: env.HF_TOKEN };
    const loaded = await loadConnectionEnv(input);
    assert.equal(loaded.HF_TOKEN, env.HF_TOKEN);
    assert.equal(loaded.HF_S3_ACCESS_KEY_ID, 'saved-access');
    assert.equal(loaded.HF_S3_SECRET_ACCESS_KEY, 'saved-secret');
    assert.equal(input.HF_S3_ACCESS_KEY_ID, undefined);
    const allSaved = await loadConnectionEnv({ HF_CREDENTIALS_FILE: file });
    assert.equal(allSaved.HF_TOKEN, 'saved-token');
    const overridden = await loadConnectionEnv({ ...env, HF_CREDENTIALS_FILE: file });
    assert.deepEqual(overridden, { ...env, HF_CREDENTIALS_FILE: file });
  });
  for (const [name, content] of [['invalid JSON', env.HF_TOKEN], ['null document', 'null']]) {
    await test(`malformed credentials (${name}) fail with a sanitized diagnostic`, async () => {
      await writeFile(file, content);
      await assert.rejects(loadConnectionEnv({ HF_CREDENTIALS_FILE: file }), error => {
        assert.equal(error.message, 'Unable to read the local Hugging Face credentials file');
        noSecrets({ message: error.message });
        return true;
      });
    });
  }
} finally { await rm(directory, { recursive: true, force: true }); }
console.log(JSON.stringify({ status: failures.length ? 'failed' : 'passed', passed: checks.length, checks, failures }, null, 2));
if (failures.length) process.exitCode = 1;
