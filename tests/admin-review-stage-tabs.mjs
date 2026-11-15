import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/app.mjs';
import { hashPassword } from '../server/security.mjs';

// The admin console separates the review queue by stage (1 AI, 2 manual, 3 client, complete).
// This drives the real service and the real admin page; nothing is stubbed.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.resolve(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-admin-stage-tabs-'));
const output = path.resolve(process.env.ADMIN_STAGE_TABS_DIR || '.artifacts/admin-review-stage-tabs');
await mkdir(output, { recursive: true });
const port = Number(process.env.ADMIN_STAGE_TABS_PORT || 4398), base = `http://127.0.0.1:${port}`, service = createService({ directory, origin: base });
await new Promise(resolve => service.server.listen(port, '127.0.0.1', resolve));
const password = 'Local-admin-stage-only-2026!', at = service.store.now();
for (const [id, role] of [['stage-admin', 'admin'], ['stage-member', 'member']]) {
  service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)', id, id + '@example.test', await hashPassword(password), id, role, at, at);
}
const task = service.store.one("SELECT * FROM tasks WHERE id='folding-clothes'");
const source = path.resolve('assets/videos/collection/folding-clothes.mp4'), bytes = await readFile(source);
// Waiting: ai 2, manual 1, client 1. Not waiting: one rejected at ai, one not yet submitted, one approved.
const fixtures = [['ai-1', 'submitted', 'ai'], ['ai-2', 'reviewing', 'ai'], ['manual-1', 'reviewing', 'manual'], ['client-1', 'reviewing', 'client'], ['ai-rejected', 'rejected', 'ai'], ['draft', 'uploaded', 'ai'], ['done', 'approved', 'complete']];
for (const [index, [id, status, stage]] of fixtures.entries()) {
  const created = new Date(Date.now() - index * 1000).toISOString();
  await copyFile(source, path.join(directory, 'videos', id));
  service.store.run('INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,captureTask,path,sha,status,reviewStage,revision,createdAt,submittedAt,checks,consent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, 'stage-member', task.id, '단계 QA ' + id, 'local.mp4', 'video/mp4', bytes.length, 60, 1920, 1080, task.reward, JSON.stringify(task), id, createHash('sha256').update(bytes).update(id).digest('hex'), status, stage, 1, created, status === 'uploaded' ? null : created, '{}', '{}');
}
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
const settled = () => page.waitForFunction(() => !document.querySelector('#admin-main').hasAttribute('aria-busy') && !!document.querySelector('#admin-main [data-refresh]'));
const ids = () => page.locator('tbody [data-admin-action=video]').evaluateAll(buttons => buttons.map(button => button.dataset.id).sort());
const pressed = () => page.locator('[data-video-stage][aria-pressed=true]').getAttribute('data-video-stage');
const tabCount = stage => page.locator(`[data-video-stage="${stage}"] strong`).textContent();
const choose = async stage => { await page.locator(`[data-video-stage="${stage}"]`).click(); await page.waitForFunction(value => document.querySelector('[data-video-stage][aria-pressed=true]')?.dataset.videoStage === value, stage); await settled(); };
try {
  const login = await context.request.post(base + '/api/auth/login', { headers: { Origin: base }, data: { email: 'stage-admin@example.test', password } });
  assert.equal(login.status(), 200);

  await page.goto(base + '/admin/#videos'); await settled();
  assert.equal(await pressed(), '');
  assert.deepEqual([await tabCount('ai'), await tabCount('manual'), await tabCount('client'), await tabCount('complete')], ['2', '1', '1', '1']);
  assert.equal(await page.locator('[data-video-stage=""] strong').count(), 0, 'the all tab carries no count');
  assert.equal((await ids()).length, 7, 'all tab lists every video');
  checks.push('Stage tabs show the number waiting at each stage and the number approved.');

  await choose('ai');
  assert.deepEqual(await ids(), ['ai-1', 'ai-2'], 'stage 1 lists only videos waiting at stage 1');
  assert.equal(await page.locator('#admin-filter').inputValue(), 'pending');
  assert.equal(new URL(page.url()).hash, '#videos?status=pending&stage=ai');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'admin-stage-ai', 'keyboard focus stays on the chosen tab');
  assert.deepEqual(await page.locator('tbody .admin-stage-chip').evaluateAll(chips => [...new Set(chips.map(chip => chip.dataset.stage))]), ['ai']);
  await page.screenshot({ path: path.join(output, 'videos-stage-1.png'), fullPage: true });
  await choose('manual'); assert.deepEqual(await ids(), ['manual-1']);
  await choose('client'); assert.deepEqual(await ids(), ['client-1']);
  assert.equal(new URL(page.url()).hash, '#videos?status=pending&stage=client');
  checks.push('Each waiting stage lists only its own videos and writes a shareable address.');

  await page.reload(); await settled();
  assert.equal(await pressed(), 'client'); assert.deepEqual(await ids(), ['client-1']);
  checks.push('A stage address survives a reload.');

  await choose('ai');
  await page.locator('#admin-filter').selectOption('rejected'); await page.waitForFunction(() => new URL(location.href).hash === '#videos?status=rejected&stage=ai'); await settled();
  assert.equal(await pressed(), 'ai'); assert.deepEqual(await ids(), ['ai-rejected'], 'status filter widens within the chosen stage');
  await page.locator('#admin-filter').selectOption('all'); await page.waitForFunction(() => new URL(location.href).hash === '#videos?stage=ai'); await settled();
  assert.deepEqual(await ids(), ['ai-1', 'ai-2', 'ai-rejected', 'draft']);
  checks.push('The status filter combines with the chosen stage.');

  await choose('complete');
  assert.deepEqual(await ids(), ['done']); assert.equal(await page.locator('#admin-filter').inputValue(), 'approved');
  assert.equal(new URL(page.url()).hash, '#videos?status=approved&stage=complete');
  // A removed approval keeps reviewStage='complete'; the tab's number and its list must still agree.
  service.store.run("UPDATE videos SET status='deleting' WHERE id='done'");
  await page.locator('[data-refresh]').click(); await page.waitForFunction(() => !document.querySelector('[data-video-stage="complete"] strong') || document.querySelector('[data-video-stage="complete"] strong').textContent === '0'); await settled();
  assert.deepEqual(await ids(), []); assert.equal(await tabCount('complete'), '0');
  service.store.run("UPDATE videos SET status='approved' WHERE id='done'");
  await page.locator('[data-refresh]').click(); await page.waitForFunction(() => document.querySelector('[data-video-stage="complete"] strong')?.textContent === '1'); await settled();
  await page.locator('#admin-search').fill('없는 영상'); await page.waitForFunction(() => /검색 결과 0건/.test(document.querySelector('.admin-count')?.textContent || '')); await settled();
  assert.equal(await pressed(), 'complete', 'searching keeps the chosen stage');
  assert.equal(await page.locator('#admin-search-reset').isDisabled(), false);
  await page.locator('#admin-search-reset').click(); await page.waitForFunction(() => new URL(location.href).hash === '#videos'); await settled();
  assert.equal(await pressed(), ''); assert.equal((await ids()).length, 7);
  assert.equal(await page.locator('#admin-search-reset').isDisabled(), true);
  checks.push('Complete tab, search within a stage and reset work.');

  // Approving stage 1 moves the video to stage 2: counts and lists follow the real service state.
  await choose('ai');
  await page.locator('tbody [data-admin-action="video"][data-id="ai-1"]').click(); await page.locator('[data-review]').waitFor();
  await page.locator('[data-review] [value="approved"]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' }); await page.locator('.admin-review-feedback [role=status]').filter({ hasText: '1단계' }).waitFor(); await settled();
  assert.equal(service.store.one("SELECT reviewStage FROM videos WHERE id='ai-1'").reviewStage, 'manual');
  assert.equal(await pressed(), 'ai'); assert.deepEqual(await ids(), ['ai-2']);
  assert.deepEqual([await tabCount('ai'), await tabCount('manual'), await tabCount('client')], ['1', '2', '1']);
  await choose('manual'); assert.deepEqual(await ids(), ['ai-1', 'manual-1']);
  checks.push('After a stage approval the video leaves its tab and appears in the next one.');

  await page.goto(base + '/admin/#overview'); await settled();
  assert.match(await page.locator('.online-kpi').filter({ hasText: '심사 대기' }).textContent(), /1단계 1 · 2단계 2 · 3단계 1/);
  assert.deepEqual(await page.locator('.admin-stage-links a strong').allTextContents(), ['1건', '2건', '1건']);
  await page.screenshot({ path: path.join(output, 'overview.png'), fullPage: true });
  await page.locator('.admin-stage-links a').nth(1).click(); await page.waitForURL('**/#videos?status=pending&stage=manual'); await settled();
  assert.equal(await pressed(), 'manual'); assert.deepEqual(await ids(), ['ai-1', 'manual-1']);
  await page.screenshot({ path: path.join(output, 'videos-stage-2.png'), fullPage: true });
  checks.push('The dashboard shows the waiting count per stage and links into each stage.');

  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + '/admin/#videos?status=pending&stage=ai'); await page.reload(); await settled();
  assert.equal(await pressed(), 'ai');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'no horizontal page scroll at phone width');
  await page.screenshot({ path: path.join(output, 'videos-stage-1-390.png'), fullPage: true });
  checks.push('Stage tabs wrap without horizontal scrolling at 390px.');

  // If the per-stage counts cannot be read, the list must still load.
  await page.setViewportSize({ width: 1440, height: 1000 });
  const countRequest = url => url.pathname === '/api/admin/videos' && url.searchParams.get('limit') === '1';
  await context.route(countRequest, route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"count unavailable"}' }));
  await page.goto(base + '/admin/#videos?status=pending&stage=manual'); await page.reload(); await settled();
  assert.deepEqual(await ids(), ['ai-1', 'manual-1']); assert.equal(await page.locator('[data-video-stage="ai"] strong').count(), 0);
  await context.unroute(countRequest);
  checks.push('A failed count hides the numbers and keeps the list.');

  assert.deepEqual(errors, []);
  console.log(checks.map(check => 'ok - ' + check).join('\n'));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  console.error('Browser errors:', errors); throw error;
} finally {
  await browser.close(); await service.close(); await rm(directory, { recursive: true, force: true });
}
