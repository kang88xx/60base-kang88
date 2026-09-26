import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { defaultCredentialsFile } from '../tools/hf-connect.mjs';

const REQUIRED = ['HF_TOKEN', 'HF_BUCKET_ID', 'HF_SPACE_ID', 'HF_S3_ACCESS_KEY_ID', 'HF_S3_SECRET_ACCESS_KEY', 'HF_STATE_KEY', 'DONGJAKSO_GATEWAY_KEY', 'DONGJAKSO_ORIGIN', 'PUBLIC_FIREBASE_PROJECT_ID'];

export async function readiness({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const report = { ok: true, env: {}, checks: [] };
  function fail(name, error) { report.ok = false; report.checks.push({ name, ok: false, error }); }
  for (const name of REQUIRED) {
    report.env[name] = Boolean(env[name]);
    if (!env[name]) fail('configuration', `missing ${name}`);
  }
  if (env.HF_STATE_KEY) {
    const key = Buffer.from(env.HF_STATE_KEY, 'base64');
    if (key.length !== 32 || key.toString('base64') !== env.HF_STATE_KEY) fail('configuration', 'HF_STATE_KEY must be a base64 encoded 32-byte key');
  }
  if (env.DONGJAKSO_GATEWAY_KEY && env.DONGJAKSO_GATEWAY_KEY.length < 32) fail('configuration', 'DONGJAKSO_GATEWAY_KEY must contain at least 32 characters');
  if (env.DONGJAKSO_ORIGIN && env.DONGJAKSO_ORIGIN !== 'https://60base.ai') fail('configuration', 'DONGJAKSO_ORIGIN must be https://60base.ai');
  if (env.HF_INITIALIZE === '1') {
    for (const name of ['DONGJAKSO_ADMIN_EMAIL', 'DONGJAKSO_ADMIN_PASSWORD']) {
      report.env[name] = Boolean(env[name]);
      if (!env[name]) fail('configuration', `missing ${name} for HF_INITIALIZE=1`);
    }
  }
  async function check(name, action) {
    try { report.checks.push({ name, ok: true, result: await action() }); }
    catch (error) { fail(name, error instanceof ReadinessError ? error.message : 'Hugging Face request failed'); }
  }
  async function hfJson(route) {
    const response = await fetchImpl(`https://huggingface.co${route}`, {
      headers: { Authorization: `Bearer ${env.HF_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw publicError(`HF API returned ${response.status}`);
    return response.json();
  }
  if (env.HF_TOKEN) {
    await check('whoami-v2', async () => {
      const data = await hfJson('/api/whoami-v2');
      if (!data.name || data.isPro !== true) throw publicError('a verified PRO user account is required');
      return { name: data.name, isPro: true };
    });
  }
  if (env.HF_TOKEN && env.HF_BUCKET_ID) {
    await check('bucket metadata', async () => {
      const data = await hfJson(`/api/buckets/${resourcePath(env.HF_BUCKET_ID)}`);
      if (data.private !== true) throw publicError('the video bucket must be private');
      if (data.id !== env.HF_BUCKET_ID) throw publicError('bucket identity does not match HF_BUCKET_ID');
      return { id: data.id, private: true };
    });
  }
  if (env.HF_TOKEN && env.HF_SPACE_ID) {
    await check('Space repository', async () => {
      const data = await hfJson(`/api/spaces/${resourcePath(env.HF_SPACE_ID)}`);
      if (data.private !== true || data.sdk !== 'docker') throw publicError('the operations Space must be private and use Docker');
      if (data.id !== env.HF_SPACE_ID) throw publicError('Space identity does not match HF_SPACE_ID');
      return { id: data.id, private: true, sdk: data.sdk };
    });
  }
  return report;
}

class ReadinessError extends Error {}
function publicError(message) { return new ReadinessError(message); }
function resourcePath(value) {
  const parts = String(value).split('/');
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(part) || part.endsWith('.'))) {
    throw publicError('HF resource ID must be namespace/name');
  }
  return parts.map(encodeURIComponent).join('/');
}

export async function loadConnectionEnv(env = process.env) {
  let saved;
  try { saved = JSON.parse(await readFile(defaultCredentialsFile(env), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return { ...env };
    throw publicError('Unable to read the local Hugging Face credentials file');
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw publicError('Unable to read the local Hugging Face credentials file');
  const merged = { ...env };
  for (const [key, value] of Object.entries({ HF_TOKEN: saved.hfToken, HF_S3_ACCESS_KEY_ID: saved.hfS3AccessKeyId, HF_S3_SECRET_ACCESS_KEY: saved.hfS3SecretAccessKey })) {
    if (!merged[key] && typeof value === 'string') merged[key] = value;
  }
  return merged;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await readiness({ env: await loadConnectionEnv() });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: error instanceof ReadinessError ? error.message : 'Readiness check failed' }));
    process.exitCode = 1;
  }
}
