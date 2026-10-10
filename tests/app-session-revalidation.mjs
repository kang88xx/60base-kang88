import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/app.mjs';
import { digest } from '../server/security.mjs';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-session-revalidation-'));
const origin = 'http://127.0.0.1:4398', service = createService({ directory, origin });
await new Promise(resolve => service.server.listen(4398, '127.0.0.1', resolve));
const at = service.store.now();
service.store.run('INSERT INTO users(id,email,password,name,createdAt,updatedAt) VALUES(?,?,?,?,?,?)', 'session-review', 'session@example.test', 'unused', '세션 검토', at, at);
const popup = JSON.parse(service.store.one('SELECT value FROM settings WHERE key=?', 'welcomePopup').value);
service.store.run('UPDATE settings SET value=? WHERE key=?', JSON.stringify({ ...popup, enabled: false }), 'welcomePopup');
const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
let blocked;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera', 'microphone'] });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let sessionRequests = 0;
  await page.route('**/api/session', async route => {
    sessionRequests++;
    if (blocked) { const current = blocked; current.seen(); await current.promise; }
    await route.continue();
  });
  function blockSession() {
    let release, seen;
    const promise = new Promise(resolve => { release = resolve; });
    const requested = new Promise(resolve => { seen = resolve; });
    blocked = { promise, seen, release };
    return { requested, release: () => { blocked = null; release(); } };
  }
  let sessionNumber = 0;
  async function signIn() {
    const token = `session-${++sessionNumber}`;
    service.store.run('INSERT INTO sessions VALUES(?,?,?,?,?)', digest(token), 'session-review', `csrf-${sessionNumber}`, Date.now() + 60000, Date.now());
    await context.addCookies([{ name: 'dongjakso_session', value: token, url: origin, httpOnly: true, sameSite: 'Strict' }]);
    await page.goto(origin + `/app/?session-case=${sessionNumber}#guide/dishwashing/3`);
    await page.waitForFunction(() => document.querySelector('.app-shell')?.dataset.screen === 'guide');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      const original = Date.now; let offset = 0;
      window.advanceSessionClock = amount => { offset += amount; };
      Date.now = () => original() + offset;
    });
  }
  const screen = expected => page.waitForFunction(value => document.querySelector('.app-shell')?.dataset.screen === value, expected);
  const resume = () => page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
  });

  await signIn();
  await page.locator('[data-app-action="record"]').first().click();
  await page.locator('.studio-camera-dialog[open]').waitFor();
  await page.evaluate(() => { window.originalCamera = document.querySelector('.studio-camera-dialog'); window.advanceSessionClock(2000); });
  const same = blockSession(), before = sessionRequests;
  await resume(); await same.requested;
  await screen('welcome');
  assert.equal(await page.evaluate(async () => (await import('/app/service.js')).requireFreshAppSession()), false);
  assert.equal(await page.evaluate(() => window.originalCamera.isConnected && window.originalCamera.open), true, 'checking the same session does not close an active camera');
  assert.equal(sessionRequests, before + 1, 'focus/visibility/pageshow share one request');
  same.release(); await screen('guide');
  assert.equal(await page.evaluate(() => window.originalCamera.isConnected && window.originalCamera.open), true, 'valid revalidation preserves the exact camera instance');
  await page.evaluate(async () => (await import('/studio/camera.js')).closeStudioCamera());

  // Reproduce the reported failure using actual database session expiry.
  service.store.run('UPDATE sessions SET expiresAt=? WHERE userId=?', Date.now() - 1, 'session-review');
  await page.evaluate(() => window.advanceSessionClock(2000));
  const expired = blockSession(); await resume(); await expired.requested; await screen('welcome');
  expired.release();
  await page.waitForFunction(async () => { const state = (await import('/app/service.js')).getAppState(); return !state.sessionChecking && !state.user; });
  assert.equal(await page.locator('.app-shell').getAttribute('data-screen'), 'welcome', 'expired resume never reopens the member screen');

  // An old in-memory session cannot enter a member deep link even without a resume event.
  await signIn();
  await page.evaluate(() => window.advanceSessionClock(46000));
  const action = blockSession();
  await page.locator('[data-app-action="record"]').first().click();
  await action.requested; await screen('welcome');
  assert.equal(await page.locator('.studio-camera-dialog[open]').count(), 0, 'stale camera click verifies first without asynchronously opening a camera');
  action.release(); await screen('guide');
  await page.locator('[data-app-action="record"]').first().click();
  await page.locator('.studio-camera-dialog[open]').waitFor();
  await page.evaluate(async () => (await import('/studio/camera.js')).closeStudioCamera());
  service.store.run('UPDATE sessions SET expiresAt=? WHERE userId=?', Date.now() - 1, 'session-review');
  const navigation = blockSession();
  await page.evaluate(() => { window.advanceSessionClock(46000); location.hash = 'profile'; });
  await navigation.requested; await screen('welcome'); navigation.release();
  await page.waitForFunction(async () => !(await import('/app/service.js')).getAppState().sessionChecking);
  assert.equal(await page.locator('.app-shell').getAttribute('data-screen'), 'welcome');
  assert.equal(await page.locator('.identity-card').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS session revalidation: real expiry on resume, merged foreground events, verification gate/private action denial, same-session camera preservation, stale member deep-link denial.');
} finally { blocked?.release(); await browser.close(); await service.close(); await rm(directory, { recursive: true, force: true }); }
