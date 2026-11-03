import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/app.mjs';
import { digest } from '../server/security.mjs';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-filming-feedback-'));
const output = path.resolve(process.env.FEEDBACK_OUTPUT || '.artifacts/filming-feedback');
await mkdir(output, { recursive: true });
const service = createService({ directory, origin: 'http://127.0.0.1:4501' });
await new Promise(resolve => service.server.listen(4501, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:4501';
const at = service.store.now();
service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)', 'feedback-member', 'feedback@example.test', 'unused', '촬영 안내 확인', 'member', at, at);
service.store.run('INSERT INTO sessions VALUES(?,?,?,?,?)', digest('feedback-session'), 'feedback-member', 'feedback-csrf', Date.now() + 600000, Date.now());
const popup = JSON.parse(service.store.one('SELECT value FROM settings WHERE key=?', 'welcomePopup').value);
service.store.run('UPDATE settings SET value=? WHERE key=?', JSON.stringify({ ...popup, enabled: false }), 'welcomePopup');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const errors = [], external = [], checks = [];
let page;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addCookies([{ name: 'dongjakso_session', value: 'feedback-session', url: origin, httpOnly: true, sameSite: 'Strict' }]);
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/app/#activity/dishwashing');
  await page.locator('.activity-summary').waitFor();
  const navigate = async route => {
    await page.evaluate(value => { location.hash = value; }, route);
    await page.waitForFunction(value => document.querySelector('#app-shell')?.dataset.screen === value, route.split('/')[0]);
    await page.evaluate(() => document.fonts.ready);
  };
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await navigate('activity/dishwashing');
    assert.match(await page.locator('#app-main').innerText(), /촬영 조건[\s\S]*촬영 전 확인/);
    assert.equal(await page.locator('[data-app-action=sample]').count(), 1);
    for (const step of [1, 2, 3, 4]) {
      await navigate(`guide/dishwashing/${step}`);
      await page.getByText(`4단계 중 ${step}단계`, { exact: true }).waitFor();
      assert.equal(await page.locator('.alan-guide-progress a').count(), 4);
      assert.equal(await page.locator('.alan-guide-progress [aria-current=step]').count(), 1);
      assert.equal(await page.locator('[data-app-action=record]').count(), step === 4 ? 1 : 0);
      assert.equal(await page.locator('[data-app-action=import]').count(), step === 4 ? 1 : 0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('#app-main').scrollWidth > document.querySelector('#app-main').clientWidth);
      assert.equal(overflow, false, `horizontal overflow: ${width}px guide${step}`);
      if (width === 390) await page.screenshot({ path: path.join(output, `guide-${step}-390.png`), fullPage: true });
      checks.push({ width, step, overflow });
    }
  }
  await page.locator('[data-app-action=prepare-activity]').click();
  await page.waitForURL(/#education\/dishwashing\/4$/);
  assert.equal(await page.locator('#app-header .app-back').first().getAttribute('href'), '#guide/dishwashing/4');
  await page.locator('[data-prep-action=education-step][data-prep-step="2"]').click();
  for (const [question, answer] of Object.entries({ q1: 'landscape', q2: 'privacy', q3: 'natural' })) await page.locator(`[data-prep-question=${question}][data-prep-answer=${answer}]`).click();
  await page.locator('[data-prep-action=complete-training]').click();
  for (const key of ['headgear', 'landscape', 'oneMinute', 'privacy']) await page.locator(`[data-prep-check=${key}]`).check();
  assert.match(await page.locator('.prep-preflight').innerText(), /0.5배[\s\S]*10초/);
  await page.locator('.prep-actions a[href="#guide/dishwashing/4"]').click();
  await page.getByText('4단계 중 4단계', { exact: true }).waitFor();
  await navigate('missions');
  await page.locator('.filming-activity-ideas > summary').click();
  assert.equal(await page.locator('.filming-activity-ideas > details').count(), 8);
  await page.locator('.filming-activity-ideas > details').first().locator('summary').click();
  assert.match(await page.locator('.filming-activity-ideas').innerText(), /실제 제출은 현재 촬영 활동 목록에 공개된 항목/);
  await page.screenshot({ path: path.join(output, 'activity-ideas-430.png'), fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(path.join(output, 'validation.json'), JSON.stringify({ checks, errors, external, educationReturnStep: 4, scope: 'Disposable local service and browser only; no real user or production mutations.' }, null, 2));
  console.log('PASS: 12 responsive four-step guide checks, activity conditions, education/quiz/preflight return to4,8 informational environments, no page errors or external requests.');
} finally {
  await browser.close();
  await service.close();
  assert.ok(directory.startsWith(path.join(os.tmpdir(), 'ego-filming-feedback-')));
  await rm(directory, { recursive: true, force: true });
}
