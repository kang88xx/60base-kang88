import { pathToFileURL } from 'node:url';
import { loadConnectionEnv } from './hf-readiness.mjs';

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;

class ProvisionError extends Error {}
function fail(message) { throw new ProvisionError(message); }

function resourceId(value, account) {
  const parts = typeof value === 'string' ? value.split('/') : [];
  if (parts.length !== 2 || parts.some(part => !NAME.test(part) || part.endsWith('.'))) fail('HF resource ID must be namespace/name');
  if (parts[0] !== account) fail('Resources must belong to the verified personal account');
  return parts.join('/');
}

export async function provision({ env = process.env, fetchImpl = globalThis.fetch, apply = false } = {}) {
  const report = { ok: false, mode: apply === true ? 'apply' : 'plan', resources: [] };
  try {
    if (typeof env.HF_TOKEN !== 'string' || !env.HF_TOKEN.trim()) fail('HF_TOKEN is required');
    async function request(route, { method = 'GET', body } = {}) {
      return fetchImpl(`https://huggingface.co${route}`, {
        method,
        headers: { Authorization: `Bearer ${env.HF_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error', signal: AbortSignal.timeout(15_000),
      });
    }
    const identity = await request('/api/whoami-v2');
    if (!identity.ok) fail('Unable to verify Hugging Face account');
    const account = await identity.json();
    if (!account || account.isPro !== true || account.type !== 'user' || typeof account.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(account.name)) fail('A verified PRO user account is required');
    report.account = account.name;
    const resources = [
      { kind: 'bucket', id: resourceId(env.HF_BUCKET_ID ?? `${account.name}/dongjakso-videos`, account.name) },
      { kind: 'space', id: resourceId(env.HF_SPACE_ID ?? `${account.name}/dongjakso-operations`, account.name) },
    ];
    async function inspect(resource) {
      const route = `/api/${resource.kind === 'bucket' ? 'buckets' : 'spaces'}/${resource.id}`;
      const response = await request(route);
      if (response.status === 404) return false;
      if (!response.ok) fail('Unable to inspect Hugging Face resource');
      const data = await response.json();
      if (!data || data.id !== resource.id || data.private !== true || (resource.kind === 'space' && data.sdk !== 'docker')) fail('Existing resource identity, privacy or Docker configuration does not match');
      return true;
    }
    // Complete both preflight checks before allowing any resource creation.
    for (const resource of resources) {
      const exists = await inspect(resource);
      report.resources.push({ ...resource, status: exists ? 'existing' : 'missing', action: exists ? 'none' : 'create_private' });
    }
    if (apply === true) {
      for (const resource of report.resources) {
        if (resource.status === 'existing') continue;
        const isBucket = resource.kind === 'bucket';
        const response = await request(isBucket ? `/api/buckets/${resource.id}` : '/api/repos/create', {
          method: 'POST',
          body: isBucket ? { private: true } : { name: resource.id.split('/')[1], organization: null, visibility: 'private', type: 'space', sdk: 'docker' },
        });
        if (!response.ok && response.status !== 409) fail('Unable to create private Hugging Face resource');
        // Verify independently even after a successful create or a concurrent creator's 409.
        resource.status = response.status === 409 ? 'conflict_unverified' : 'created_unverified';
        if (!await inspect(resource)) fail('Created resource could not be verified');
        resource.status = response.status === 409 ? 'existing' : 'created';
        resource.action = 'none';
      }
    }
    report.ok = true;
  } catch (error) {
    report.error = error instanceof ProvisionError ? error.message : 'Hugging Face provisioning request failed';
  }
  return report;
}

export async function main({ args = process.argv.slice(2), env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (args.some(arg => arg !== '--apply') || args.length > 1) return { ok: false, error: 'Usage: node scripts/hf-provision.mjs [--apply]' };
  try {
    return await provision({ env: await loadConnectionEnv(env), fetchImpl, apply: args.includes('--apply') });
  } catch {
    return { ok: false, error: 'Unable to load Hugging Face connection credentials' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await main();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
