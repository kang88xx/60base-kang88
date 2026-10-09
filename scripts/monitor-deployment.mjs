import { spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const argumentsList = process.argv.slice(2);
const option = name => { const index = argumentsList.indexOf(name); return index < 0 ? undefined : argumentsList[index + 1]; };
const once = argumentsList.includes('--once');
const timeoutSeconds = Number(option('--timeout') || 300);
const intervalSeconds = Number(option('--interval') || 10);
const repository = 'kang88xx/60base-kang88';
const productionUrl = 'https://60base.ai/';
const gitArguments = ['-c', `safe.directory=${path.resolve(root)}`];

function gitRead(args, input) {
  return spawnSync('git', [...gitArguments, ...args], {
    cwd: root, input, encoding: 'utf8', windowsHide: true, timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
}

function existingGitHubCredential() {
  // The credential protocol is sent through stdin. Its output stays in memory;
  // no token is passed in command arguments, files, logs or environment values.
  const result = gitRead(['-c', 'credential.interactive=never', 'credential', 'fill'], 'protocol=https\nhost=github.com\n\n');
  const token = result.status === 0 ? /^password=(.+)$/m.exec(result.stdout)?.[1]?.trim() : undefined;
  result.stdout = '';
  result.stderr = '';
  if (!token) throw new Error('An existing GitHub credential was unavailable. No interactive login was started.');
  return token;
}

const normalizeHtml = value => value.replaceAll('\r', '').trim();
const digest = value => createHash('sha256').update(normalizeHtml(value)).digest('hex');

async function run() {
  const head = gitRead(['rev-parse', 'HEAD']);
  const sha = option('--sha') || head.stdout?.trim();
  if (!/^[a-f\d]{40}$/i.test(sha || '')) throw new Error('Supply a full commit SHA with --sha.');
  if (!(timeoutSeconds > 0 && timeoutSeconds <= 3600 && intervalSeconds >= 2 && intervalSeconds <= 60)) throw new Error('Use timeout 1–3600 seconds and interval 2–60 seconds.');
  const token = existingGitHubCredential();
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': '60base-production-deployment-monitor',
  };
  async function github(endpoint) {
    const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status} for ${endpoint}.`);
    return response.json();
  }
  const expectedHtml = await readFile(path.join(root, 'dist/index.en.html'), 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!once && !expectedHtml) throw new Error('Run npm run build before monitoring the production release.');
  const startedAt = Date.now();
  let previousSummary = '';
  let snapshot;
  do {
    const [main, combined, deployments] = await Promise.all([
      github('/commits/main'), github(`/commits/${sha}/status`), github(`/deployments?sha=${sha}&environment=Production&per_page=10`),
    ]);
    const vercelStatus = combined.statuses?.find(status => /vercel/i.test(status.context));
    const deployment = deployments.find(item => item.sha === sha && /^production$/i.test(item.environment));
    const statuses = deployment ? await github(`/deployments/${deployment.id}/statuses?per_page=5`) : [];
    const deploymentStatus = statuses[0];
    let canonical = { url: productionUrl, status: null, htmlMatchesBuild: false };
    try {
      const url = new URL(productionUrl);
      url.searchParams.set('deployment-check', sha);
      const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      const html = await response.text();
      canonical = { url: productionUrl, status: response.status, htmlMatchesBuild: Boolean(expectedHtml && response.ok && digest(html) === digest(expectedHtml)) };
    } catch { canonical.error = 'The canonical site could not be read.'; }
    const ready = main.sha === sha && vercelStatus?.state === 'success' && deploymentStatus?.state === 'success' && canonical.htmlMatchesBuild;
    snapshot = {
      checkedAt: new Date().toISOString(), repository, expectedSha: sha, mainSha: main.sha,
      ready, productionSha: ready ? sha : null,
      vercel: { state: vercelStatus?.state || 'pending', dashboardUrl: vercelStatus?.target_url || null },
      productionDeployment: deployment ? {
        id: deployment.id, sha: deployment.sha, createdAt: deployment.created_at,
        state: deploymentStatus?.state || 'pending',
        url: deploymentStatus?.environment_url || deploymentStatus?.target_url || null,
        logUrl: deploymentStatus?.log_url || null,
      } : null,
      canonical,
    };
    const summary = JSON.stringify({ main: snapshot.mainSha, vercel: snapshot.vercel.state, deployment: snapshot.productionDeployment?.state || 'pending', canonical: canonical.htmlMatchesBuild, ready });
    if (summary !== previousSummary || once) { console.log(JSON.stringify(snapshot, null, 2)); previousSummary = summary; }
    if (ready || once) break;
    if (['failure', 'error'].includes(vercelStatus?.state) || ['failure', 'error'].includes(deploymentStatus?.state)) throw new Error('Vercel reported a failed deployment. Inspect the dashboard URL in the last public status snapshot.');
    if (Date.now() - startedAt >= timeoutSeconds * 1000) break;
    await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
  } while (Date.now() - startedAt < timeoutSeconds * 1000);
  await mkdir(path.join(root, '.artifacts'), { recursive: true });
  await writeFile(path.join(root, '.artifacts/deployment-status.json'), JSON.stringify(snapshot, null, 2) + '\n');
  if (!once && !snapshot.ready) throw new Error(`Production was not confirmed within ${timeoutSeconds} seconds. Public status is saved in .artifacts/deployment-status.json.`);
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
