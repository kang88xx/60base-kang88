import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/app.mjs';
import { digest } from '../server/security.mjs';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-review-regression-'));
const output = path.resolve(process.env.APP_REVIEW_OUTPUT || '.artifacts/app-review');
await mkdir(output, { recursive: true });
const origin = 'http://127.0.0.1:4499', service = createService({ directory, origin });
await new Promise(resolve => service.server.listen(4499, '127.0.0.1', resolve));
const at = service.store.now();
for (const role of ['admin', 'member']) {
  service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)', `review-${role}`, `${role}@example.test`, 'unused', `리뷰 ${role}`, role, at, at);
  service.store.run('INSERT INTO sessions VALUES(?,?,?,?,?)', digest(`review-${role}-session`), `review-${role}`, `csrf-${role}`, Date.now() + 600000, Date.now());
}
const popup = JSON.parse(service.store.one('SELECT value FROM settings WHERE key=?', 'welcomePopup').value);
service.store.run('UPDATE settings SET value=? WHERE key=?', JSON.stringify({ ...popup, enabled: false }), 'welcomePopup');
const browser = await chromium.launch({ headless: true });
const errors = [], external = [], checks = [], layout = [], contrast = [];
let page;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addCookies([{ name: 'dongjakso_session', value: 'review-member-session', url: origin, httpOnly: true, sameSite: 'Strict' }]);
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function saveTask(task) {
    const response = await fetch(origin + '/api/admin/tasks', { method: 'POST', headers: { Origin: origin, Cookie: 'dongjakso_session=review-admin-session', 'X-CSRF-Token': 'csrf-admin', 'Content-Type': 'application/json' }, body: JSON.stringify(task) });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result.id;
  }
  async function navigate(route) {
    await page.evaluate(value => { location.hash = value; }, route);
    await page.waitForFunction(value => document.querySelector('#app-shell')?.dataset.screen === value, route.split('/')[0]);
    await page.evaluate(() => document.fonts.ready);
  }
  const plan = () => page.evaluate(async () => (await import('/app/preparation.js')).getPreparationState());
  const existingInstructions = '관리자가 수정한 촬영 안내\n양손과 작업 대상을 함께 담으세요.\n<img src=x onerror="window.reviewInjected=true">';
  const existing = { ...service.store.one('SELECT * FROM tasks WHERE id=?', 'dishwashing'), instructions: existingInstructions, published: true };
  await saveTask(existing);
  const newTask = { title: 'QA 새 촬영 활동', category: '주방', instructions: '새 활동 첫 번째 촬영 안내\n두 번째 줄: 안전을 먼저 확인하세요.', reward: 3000, published: true };
  const newId = await saveTask(newTask);
  await page.goto(origin + '/app/#activity/dishwashing');
  await page.locator('.activity-instructions').waitFor();
  assert.equal(await page.locator('.activity-instructions').textContent(), existingInstructions);
  assert.equal(await page.locator('.activity-instructions').evaluate(node => getComputedStyle(node).whiteSpace), 'pre-wrap');
  assert.equal(await page.locator('.activity-instructions img').count(), 0);
  assert.equal(await page.evaluate(() => window.reviewInjected), undefined);
  assert.ok(await page.locator('.activity-steps li').count() > 0, 'static examples remain supplementary');
  assert.equal(await page.locator('[data-app-action=sample]').count(), 1, 'existing sample remains available');
  await page.locator('[data-app-action=save-activity]').click();
  await navigate(`activity/${newId}`);
  await page.waitForFunction(value => document.querySelector('.activity-instructions')?.textContent === value, newTask.instructions);
  await page.screenshot({ path: path.join(output, 'new-activity-390.png'), fullPage: true });
  await page.locator('[data-app-action=save-activity]').click();
  await page.locator('[data-app-action=prepare-activity]').click();
  await page.waitForURL('**/#education');
  assert.equal((await plan()).plan.selected, newId);
  assert.deepEqual((await plan()).plan.saved.sort(), ['dishwashing', newId].sort());
  assert.match(await page.locator('.prep-status').innerText(), /QA 새 촬영 활동 준비 중/);
  assert.equal(await page.locator(`[data-prep-id="${newId}"][data-prep-action=select]`).getAttribute('aria-pressed'), 'true');
  for (const [question, answer] of Object.entries({ q1: 'landscape', q2: 'privacy', q3: 'natural' })) await page.locator(`[data-prep-question=${question}][data-prep-answer=${answer}]`).click();
  await page.locator('[data-prep-action=complete-training]').click();
  for (const key of ['headgear', 'landscape', 'fiveMinutes', 'privacy']) await page.locator(`[data-prep-check=${key}]`).check();
  assert.equal((await plan()).training.completed, true);
  assert.match(await page.locator('.prep-status').innerText(), /촬영 준비 완료/);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await plan()).plan.selected, newId, 'new IDs survive reload before catalog completion');
  assert.deepEqual((await plan()).plan.saved.sort(), ['dishwashing', newId].sort());
  assert.equal((await plan()).training.completed, true);
  assert.equal(Object.keys((await plan()).training.preflight).length, 4);
  checks.push('Administrator API edits/new task publication → escaped multiline activity guidance → save → education, quiz/preflight and reload persistence.');

  // A failed catalog request must not destroy saved selections or silently allow a new selection.
  await page.route('**/api/catalog', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"QA catalog unavailable"}' }));
  await page.evaluate(async () => { await (await import('/app/service.js')).refreshApp(); });
  assert.equal((await plan()).plan.selected, newId);
  for (const route of [`activity/${newId}`, `guide/${newId}/1`, `guide/${newId}/3`]) {
    await navigate(route);
    assert.match(await page.locator('#app-main').innerText(), /활동 정보를 확인하지 못했어요/);
    assert.doesNotMatch(await page.locator('#app-main').innerText(), /공개가 종료|설거지/);
    assert.equal(await page.locator('[data-app-action=record]').count(), 0, 'failed lookup cannot record a different fallback task');
    assert.equal(await page.locator('[data-app-action=refresh]').count(), 1);
  }
  await navigate('education');
  await page.locator('[data-prep-action=select][data-prep-id=dishwashing]').click();
  await page.getByText('현재 공개된 활동을 확인하지 못했어요. 인터넷 연결을 확인하고 다시 불러와주세요.', { exact: true }).waitFor();
  assert.equal((await plan()).plan.selected, newId);
  await page.unroute('**/api/catalog');
  await page.evaluate(async () => { await (await import('/app/service.js')).refreshApp(); });
  await page.locator('#app-toast').waitFor({ state: 'hidden' });
  checks.push('Catalog failure preserves saved selections and announces unavailable selection; activity/guide deep links offer retry without switching to another task or reporting archive.');

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['home', 'missions', `activity/${newId}`, 'guide/dishwashing/1', 'education', 'ranking', 'wallet', 'profile', 'settings', 'library', 'reviews', 'announcements', 'estimate']) {
      await navigate(route);
      const result = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, width: innerWidth, route: location.hash }));
      assert.equal(result.overflow, false, JSON.stringify(result)); layout.push(result);
      if (['home', 'profile', 'ranking', 'education'].includes(route)) {
        const nav = await page.locator('.app-bottom-nav > a').evaluateAll(nodes => nodes.map(node => { const label = node.querySelector('span:not(.app-icon)'), box = label.getBoundingClientRect(); return { label: label.textContent, visible: getComputedStyle(label).display !== 'none' && box.width > 0 && box.height > 0, size: parseFloat(getComputedStyle(label).fontSize) }; }));
        assert.equal(nav.length, 4); assert.ok(nav.every(item => item.visible && item.size >= 12));
        if (width < 400) await page.screenshot({ path: path.join(output, `${route}-${width}.png`), fullPage: true });
      }
      if (route === 'home') {
        assert.equal(await page.locator('.feature-card').first().getAttribute('aria-label'), null, 'the natural link name includes the title, review condition and reward');
        assert.match(await page.locator('.feature-card').first().ariaSnapshot(), /검수 승인 시/);
        assert.match(await page.locator('[aria-label="공지사항"] .app-icon').getAttribute('style'), /bell\.svg/);
        const targets = await page.locator('.rail-dots button').evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }));
        assert.ok(targets.length > 0 && targets.every(item => item.width >= 44 && item.height >= 44));
      }
      if (route === 'announcements') assert.equal(await page.locator('.header-title').textContent(), '공지사항');
      if (route === 'profile' || route === 'ranking') {
        const selector = route === 'profile' ? '.profile-stat-grid span' : '.ego-progress-card > p';
        const values = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
          const style = getComputedStyle(node), ownBg = style.backgroundColor, background = ownBg === 'rgba(0, 0, 0, 0)' ? getComputedStyle(node.parentElement).backgroundColor : ownBg;
          const luminance = color => { const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
          const f = luminance(style.color), b = luminance(background); return { text: node.textContent, fontSize: parseFloat(style.fontSize), foreground: style.color, background, ratio: (Math.max(f, b) + .05) / (Math.min(f, b) + .05) };
        }));
        assert.ok(values.length > 0 && values.every(item => item.fontSize >= 12 && item.ratio >= 4.5), JSON.stringify(values)); contrast.push({ width, route, values });
      }
    }
  }
  checks.push('39 route/viewport checks at 320, 390 and 1440 px; labels visible, dots 44px and profile/ranking auxiliary contrast ≥4.5:1.');

  await saveTask({ ...newTask, id: newId, published: false });
  await page.evaluate(async () => { await (await import('/app/service.js')).refreshApp(); });
  await navigate('education');
  assert.deepEqual((await plan()).plan, { saved: ['dishwashing'], selected: '' });
  assert.deepEqual((await plan()).training.preflight, {});
  assert.equal((await plan()).training.completed, true, 'archiving does not delete valid completed education');
  assert.match((await plan()).notice, /공개가 종료된 활동/);
  assert.equal(await page.locator(`[data-prep-id="${newId}"]`).count(), 0);
  await navigate(`activity/${newId}`);
  assert.match(await page.locator('#app-main').innerText(), /현재 공개되지 않은 활동/);
  assert.equal(await page.locator('[data-app-action=prepare-activity]').count(), 0);
  for (const step of [1, 3]) {
    await navigate(`guide/${newId}/${step}`);
    assert.match(await page.locator('#app-main').innerText(), /현재 공개되지 않은 활동/);
    assert.equal(await page.locator('[data-app-action=record]').count(), 0, 'an archived guide never records the first task as a fallback');
    assert.equal(await page.locator('.guide-progress').count(), 0);
  }
  await page.reload({ waitUntil: 'networkidle' });
  assert.deepEqual((await plan()).plan, { saved: ['dishwashing'], selected: '' });
  await navigate('education');
  await page.locator('[data-prep-action=select][data-prep-id=dishwashing]').click();
  assert.equal((await plan()).plan.selected, 'dishwashing');
  checks.push('Archiving prunes only unavailable saved IDs/selection and preflight, preserves other saved tasks and education, and explains archived deep links.');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile(path.join(output, 'validation.json'), JSON.stringify({ checks, layout, contrast, errors, external, scope: 'Disposable local service database and headless Chromium. No production data/provider login/native hardware exercised.' }, null, 2));
  console.log('PASS app review regressions: ' + checks.join('\n'));
} catch (error) {
  await page?.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close(); await service.close();
  assert.ok(directory.startsWith(path.join(os.tmpdir(), 'ego-review-regression-')));
  await rm(directory, { recursive: true, force: true });
}
