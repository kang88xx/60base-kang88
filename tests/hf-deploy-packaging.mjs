import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readdir, copyFile, readFile, writeFile, rm, symlink, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deploy } from '../scripts/hf-deploy.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
// All credentials and fetch responses are synthetic; no connection env is read.
const env = { HF_TOKEN: 'packaging-unit-token', HF_SPACE_ID: 'packaging-test/operations' };
const fetchImpl = async url => new Response(JSON.stringify(url.endsWith('/whoami-v2')
  ? { type: 'user', isPro: true, name: 'packaging-test' }
  : { id: env.HF_SPACE_ID, private: true, sdk: 'docker', sha: 'a'.repeat(40) }));

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ego-hf-package-'));
  for (const directory of ['server', 'shared', 'deploy/huggingface']) await mkdir(path.join(root, directory), { recursive: true });
  for (const name of await readdir(path.join(repository, 'server'))) {
    if (name.endsWith('.mjs') && !name.startsWith('.')) await copyFile(path.join(repository, 'server', name), path.join(root, 'server', name));
  }
  for (const name of ['shared/video-policy.js', 'deploy/huggingface/Dockerfile', 'deploy/huggingface/README.md']) await copyFile(path.join(repository, name), path.join(root, name));
  await writeFile(path.join(root, 'shared/never-upload.js'), 'throw new Error("Unrelated UI module");');
  return root;
}

test('deployment precisely includes policy and staged server resolves its runtime imports', async () => {
  const root = await fixture();
  try {
    const report = await deploy({ root, env, fetchImpl, codeOnly: true });
    assert.equal(report.ok, true, report.error);
    assert.equal(report.committed, false);
    assert.deepEqual(report.files.filter(file => file.path.startsWith('shared/')).map(file => file.path), ['shared/video-policy.js']);
    const docker = await readFile(path.join(root, 'deploy/huggingface/Dockerfile'), 'utf8');
    assert.match(docker, /^COPY --chown=1000:1000 shared\/video-policy\.js \.\/shared\/video-policy\.js$/m);
    assert.doesNotMatch(docker, /^COPY .*shared\/ \./m);
    const stage = path.join(root, 'stage');
    for (const { path: artifact } of report.files) {
      const source = ['Dockerfile', 'README.md'].includes(artifact) ? 'deploy/huggingface/' + artifact : artifact;
      await mkdir(path.dirname(path.join(stage, artifact)), { recursive: true });
      await copyFile(path.join(root, source), path.join(stage, artifact));
    }
    execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(path.join(stage, 'server/app.mjs')).href)}); await import(${JSON.stringify(pathToFileURL(path.join(stage, 'server/upload-errors.mjs')).href)});`], { stdio: 'pipe' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing or symlinked shared policy fails packaging before any remote request', async () => {
  const root = await fixture();
  let requests = 0;
  const noNetwork = async () => { requests++; throw Error('Unexpected request'); };
  try {
    const policy = path.join(root, 'shared/video-policy.js');
    await unlink(policy);
    assert.equal((await deploy({ root, env, fetchImpl: noNetwork, codeOnly: true })).ok, false);
    await symlink(path.join(repository, 'shared/video-policy.js'), policy);
    const report = await deploy({ root, env, fetchImpl: noNetwork, codeOnly: true });
    assert.equal(report.ok, false);
    assert.equal(report.error, 'Deployment artifacts must be regular files');
    assert.equal(requests, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
