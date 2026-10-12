import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/app.mjs';

// Actual browser + disposable password backend. Provider credentials/OAuth are
// deliberately excluded; this checks the shared entry gate before any provider.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-auth-recovery-'));
// Exercise the actual hosted entry's registration switch, rather than the local default.
const hostedSource = await readFile(new URL('../server/hf-index.mjs', import.meta.url), 'utf8');
const registrationSetting = hostedSource.match(/createService\(\{[^;]*?allowRegistration:\s*(true|false)/);
assert.ok(registrationSetting, 'hosted registration policy is explicit');
const service = createService({ directory, origin: 'http://127.0.0.1:4397', allowRegistration: registrationSetting[1] === 'true' });
await new Promise(resolve => service.server.listen(4397, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:4397', browser = await chromium.launch({ headless: true });
let offline = true, sessionRequests = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/api/session', route => {
    sessionRequests++;
    return offline ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'upstream_rejected' }) }) : route.continue();
  });
  await context.route('https://**', route => route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/app/#profile');
  await page.waitForFunction(async () => !(await import('/app/service.js')).getAppState().loading);

  for (const provider of ['google', 'apple', 'email']) {
    const before = sessionRequests;
    await page.evaluate(async provider => (await import('/studio/online.js')).showAccountEntry({ provider }), provider);
    assert.ok(sessionRequests > before, `${provider} retries the unavailable session on explicit entry`);
    assert.equal(await page.locator('#cloud-account-dialog').count(), 0, `${provider} does not start identity registration while the app server is unavailable`);
    const dialog = page.locator('.online-dialog[open]');
    assert.match(await dialog.innerText(), /계정 서비스에 연결하지 못했습니다/);
    assert.equal(await dialog.locator('[data-account-retry]').count(), 1, `${provider} offers recovery`);
    await dialog.locator('[data-close]').click();
  }

  await page.locator('[data-provider="email"]').click();
  offline = false;
  await page.locator('[data-account-retry]').click();
  await page.locator('[data-auth="register"]').click();
  const form = page.locator('.online-dialog[open] form');
  await form.locator('[name="name"]').fill('로그인 검증');
  await form.locator('[name="email"]').fill('recovery@example.test');
  await form.locator('[name="password"]').fill('Recovery-password-2026');
  for (const name of ['adult', 'terms', 'privacy']) await form.locator(`[name="${name}"]`).check();
  const registered = page.waitForResponse(response => response.url() === origin + '/api/auth/register');
  await form.locator('[type="submit"]').click();
  assert.equal((await registered).status(), 201);
  await page.waitForFunction(async () => (await import('/studio/online-api.js')).session.user?.email === 'recovery@example.test');
  assert.equal(service.store.one('SELECT count(*) n FROM users').n, 1);
  assert.equal(service.store.one('SELECT role FROM users').role, 'member', 'email signup cannot grant administrator access');
  await page.evaluate(async () => (await import('/studio/online.js')).signOutAccount());
  await page.waitForFunction(async () => !(await import('/studio/online-api.js')).session.user);
  await page.locator('[data-provider="email"]').click();
  const login = page.locator('.online-dialog[open] form');
  await login.locator('[name="email"]').fill('recovery@example.test');
  await login.locator('[name="password"]').fill('incorrect-password');
  await login.locator('[type="submit"]').click();
  await login.locator('[role="status"]').filter({ hasText: '이메일과 비밀번호' }).waitFor();
  assert.equal(await login.locator('[type="submit"]').isEnabled(), true);
  await login.locator('[name="password"]').fill('Recovery-password-2026');
  const loggedIn = page.waitForResponse(response => response.url() === origin + '/api/auth/login');
  await login.locator('[type="submit"]').click();
  assert.equal((await loggedIn).status(), 200);
  await page.waitForFunction(async () => (await import('/studio/online-api.js')).session.user?.email === 'recovery@example.test');
  await page.waitForLoadState('networkidle');
  assert.equal(await page.evaluate(async () => (await import('/studio/online-api.js')).session.user?.email), 'recovery@example.test');
  assert.deepEqual(errors, []);
  console.log('PASS unavailable-service entry gate for Google/Apple/email, explicit retry recovery, real disposable email registration/logout/invalid-password/correct-password login. Live provider OAuth is not exercised.');
} finally { await browser.close(); await service.close(); await rm(directory, { recursive: true, force: true }); }
