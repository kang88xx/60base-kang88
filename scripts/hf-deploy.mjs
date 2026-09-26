import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConnectionEnv } from './hf-readiness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REQUIRED = ['HF_BUCKET_ID', 'HF_S3_ACCESS_KEY_ID', 'HF_S3_SECRET_ACCESS_KEY', 'HF_STATE_KEY', 'DONGJAKSO_GATEWAY_KEY', 'DONGJAKSO_ORIGIN', 'PUBLIC_FIREBASE_PROJECT_ID'];
const OPTIONAL = ['HF_INITIALIZE', 'DONGJAKSO_ADMIN_EMAIL', 'DONGJAKSO_ADMIN_PASSWORD'];
const CREDENTIALS = ['HF_TOKEN', 'HF_S3_ACCESS_KEY_ID', 'HF_S3_SECRET_ACCESS_KEY', 'HF_STATE_KEY', 'DONGJAKSO_GATEWAY_KEY', 'DONGJAKSO_ADMIN_PASSWORD'];
class DeployError extends Error {}
function fail(message) { throw new DeployError(message); }
function resource(value) {
  const parts = typeof value === 'string' ? value.split('/') : [];
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(part) || part.endsWith('.'))) fail('HF_SPACE_ID must be namespace/name');
  return parts;
}

async function artifacts(root, env) {
  for (const folder of ['server', 'deploy', 'deploy/huggingface']) {
    const info = await lstat(path.join(root, folder));
    if (!info.isDirectory() || info.isSymbolicLink()) fail('Deployment directories must be real directories');
  }
  const entries = await readdir(path.join(root, 'server'));
  const files = entries.filter(name => !name.startsWith('.') && name.endsWith('.mjs')).sort().map(name => ({ source: `server/${name}`, path: `server/${name}` }));
  if (!files.some(file => file.path === 'server/hf-index.mjs')) fail('Missing server entrypoint');
  files.push({ source: 'deploy/huggingface/Dockerfile', path: 'Dockerfile' }, { source: 'deploy/huggingface/README.md', path: 'README.md' });
  let total = 0;
  for (const file of files) {
    const filename = path.join(root, file.source);
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink()) fail('Deployment artifacts must be regular files');
    if ((total += info.size) > 1024 * 1024) fail('Deployment artifacts exceed the regular-upload size limit');
    file.bytes = await readFile(filename);
    for (const key of CREDENTIALS) {
      if (env[key] && file.bytes.includes(Buffer.from(env[key]))) fail('Deployment artifact contains a credential value');
    }
  }
  return files;
}

export async function deploy({ env = process.env, root = ROOT, fetchImpl = globalThis.fetch, apply = false, codeOnly = false } = {}) {
  const report = { ok: false, mode: apply === true ? 'apply' : 'plan', codeOnly: codeOnly === true, files: [], secrets: [], secretsUpdated: [], committed: false };
  try {
    for (const name of ['HF_TOKEN', 'HF_SPACE_ID', ...(codeOnly === true ? [] : REQUIRED)]) if (typeof env[name] !== 'string' || !env[name].trim()) fail(`Missing ${name}`);
    const [owner] = resource(env.HF_SPACE_ID);
    if (codeOnly !== true) {
    const stateKey = Buffer.from(env.HF_STATE_KEY, 'base64');
    if (stateKey.length !== 32 || stateKey.toString('base64') !== env.HF_STATE_KEY) fail('HF_STATE_KEY must be a base64 encoded 32-byte key');
    if (env.DONGJAKSO_GATEWAY_KEY.length < 32) fail('DONGJAKSO_GATEWAY_KEY must contain at least 32 characters');
    if (env.DONGJAKSO_ORIGIN !== 'https://60base.ai') fail('DONGJAKSO_ORIGIN must be https://60base.ai');
    if (env.HF_INITIALIZE && !['0', '1'].includes(env.HF_INITIALIZE)) fail('HF_INITIALIZE must be 0 or 1');
    if (env.HF_INITIALIZE === '1' && (!env.DONGJAKSO_ADMIN_EMAIL || !env.DONGJAKSO_ADMIN_PASSWORD)) fail('Initialization requires administrator email and password');
    }
    const files = await artifacts(root, env);
    report.files = files.map(file => ({ path: file.path, size: file.bytes.length }));
    report.secrets = codeOnly === true ? [] : [...REQUIRED, ...OPTIONAL.filter(key => typeof env[key] === 'string' && env[key].length > 0)];
    async function request(route, { method = 'GET', body, ndjson = false } = {}) {
      const response = await fetchImpl(`https://huggingface.co${route}`, {
        method, headers: { Authorization: `Bearer ${env.HF_TOKEN}`, ...(body !== undefined ? { 'Content-Type': ndjson ? 'application/x-ndjson' : 'application/json' } : {}) },
        ...(body !== undefined ? { body: ndjson ? body : JSON.stringify(body) } : {}),
        redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) fail(`Hugging Face API returned HTTP ${response.status}`);
      return response;
    }
    const account = await (await request('/api/whoami-v2')).json();
    if (account.type !== 'user' || account.isPro !== true || account.name !== owner) fail('Space must belong to the verified personal PRO account');
    const route = `/api/spaces/${env.HF_SPACE_ID}`;
    const metadata = await (await request(route)).json();
    if (metadata.id !== env.HF_SPACE_ID || metadata.private !== true || metadata.sdk !== 'docker') fail('Space identity, privacy or Docker configuration does not match');
    if (metadata.sha && !/^[a-f0-9]{40,64}$/i.test(metadata.sha)) fail('Space commit identifier is invalid');
    if (codeOnly === true && !metadata.sha) fail('Code-only deployment requires an existing versioned Space');
    report.space = env.HF_SPACE_ID;
    if (apply === true) {
      const preupload = await (await request(`${route}/preupload/main`, { method: 'POST', body: { files: files.map(file => ({ path: file.path, sample: file.bytes.subarray(0, 512).toString('base64'), size: file.bytes.length })) } })).json();
      if (!Array.isArray(preupload.files) || preupload.files.length !== files.length || new Set(preupload.files.map(file => file.path)).size !== files.length || files.some(file => !preupload.files.some(item => item.path === file.path && item.uploadMode === 'regular' && item.shouldIgnore !== true))) fail('Preupload must accept every artifact as a regular file');
      for (const key of report.secrets) {
        await request(`${route}/secrets`, { method: 'POST', body: { key, value: env[key] } });
        report.secretsUpdated.push(key);
      }
      const header = { summary: 'Keep hosted operations consistent with the current service contract', description: 'Constraint: Deploy only server sources and the Docker runtime definition.\nScope-risk: moderate', ...(metadata.sha ? { parentCommit: metadata.sha } : {}) };
      const body = [JSON.stringify({ key: 'header', value: header }), ...files.map(file => JSON.stringify({ key: 'file', value: { content: file.bytes.toString('base64'), path: file.path, encoding: 'base64' } }))].join('\n') + '\n';
      const result = await (await request(`${route}/commit/main`, { method: 'POST', body, ndjson: true })).json();
      report.committed = true;
      if (typeof result.commitOid === 'string' && /^[a-f0-9]{40,64}$/i.test(result.commitOid)) {
        report.commitOid = result.commitOid;
        const expected = `https://huggingface.co/spaces/${env.HF_SPACE_ID}/commit/${result.commitOid}`;
        if (result.commitUrl === expected) report.commitUrl = expected;
      }
    }
    report.ok = true;
  } catch (error) {
    report.error = error instanceof DeployError ? error.message : 'Hugging Face deployment failed';
  }
  return report;
}

export async function main({ args = process.argv.slice(2), env = process.env, fetchImpl = globalThis.fetch, root = ROOT } = {}) {
  if (args.length > 2 || new Set(args).size !== args.length || args.some(arg => !['--apply', '--code-only'].includes(arg))) return { ok: false, error: 'Usage: node scripts/hf-deploy.mjs [--apply] [--code-only]' };
  try { return await deploy({ env: await loadConnectionEnv(env), fetchImpl, root, apply: args.includes('--apply'), codeOnly: args.includes('--code-only') }); }
  catch { return { ok: false, error: 'Unable to load Hugging Face connection credentials' }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await main();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
