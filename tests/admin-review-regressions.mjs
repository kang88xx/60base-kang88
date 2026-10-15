import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, copyFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/app.mjs';
import { hashPassword } from '../server/security.mjs';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.resolve(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-admin-review-'));
const output = path.resolve(process.env.ADMIN_REVIEW_DIR || '.artifacts/admin-review-regressions');
await mkdir(output, { recursive: true });
const base = 'http://127.0.0.1:4399', service = createService({ directory, origin: base });
await new Promise(resolve => service.server.listen(4399, '127.0.0.1', resolve));
const password = 'Local-admin-review-only-2026!', at = service.store.now();
for (const [id, role] of [['review-admin', 'admin'], ['review-member', 'member']]) {
  service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)', id, id + '@example.test', await hashPassword(password), id, role, at, at);
}
// Known local fixtures exercise review UI and the real service validation/rewards.
// Upload/media probing is covered separately by operations-browser.mjs.
const task = service.store.one("SELECT * FROM tasks WHERE id='folding-clothes'");
const source = path.resolve('assets/videos/collection/folding-clothes.mp4'), bytes = await readFile(source);
for (const [index, [id, status, stage]] of [['a', 'submitted', 'ai'], ['b', 'reviewing', 'manual'], ['c', 'approved', 'complete'], ['d', 'submitted', 'ai']].entries()) {
  const created = new Date(Date.now() - index * 1000).toISOString();
  await copyFile(source, path.join(directory, 'videos', id));
  service.store.run(`INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,captureTask,path,sha,status,reviewStage,revision,createdAt,submittedAt,checks,consent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, 'review-member', task.id, '검수 QA ' + id, 'local.mp4', 'video/mp4', bytes.length, 60, 1920, 1080, task.reward, JSON.stringify(task), id, createHash('sha256').update(bytes).update(id).digest('hex'), status, stage, 1, created, created, '{}', '{}');
}
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
const errors = [], checks = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/\/api\/admin\/videos\/[^/]+\/review$/.test(request.url()) && request.method() === 'POST') requests.push(request.url()); });
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
const open = async id => { await page.locator(`tbody [data-admin-action="video"][data-id="${id}"]`).click(); await page.locator('[data-review]').waitFor(); };
const submit = async decision => { await page.locator(`[data-review] [value="${decision}"]`).click(); };
const result = async text => { await page.locator('dialog[open]').waitFor({ state: 'detached' }); await page.locator('.admin-review-feedback [role=status]').filter({ hasText: text }).waitFor(); await page.waitForFunction(() => !document.querySelector('#admin-main').hasAttribute('aria-busy')); };
const focused = () => page.evaluate(() => ({ name: document.activeElement.name, id: document.activeElement.dataset.id }));
try {
  const login = await context.request.post(base + '/api/auth/login', { headers: { Origin: base }, data: { email: 'review-admin@example.test', password } });
  assert.equal(login.status(), 200);
  await page.goto(base + '/admin/#overview');
  await page.locator('.admin-priority-actions a.primary').click();
  await page.waitForURL('**/#videos?status=pending');
  await page.locator('#admin-filter').waitFor();
  assert.equal(await page.locator('#admin-filter').inputValue(), 'pending');
  assert.equal(await page.locator('tbody [data-admin-action=video]').count(), 3);
  await page.reload(); await page.locator('#admin-filter').waitFor();
  assert.equal(await page.locator('#admin-filter').inputValue(), 'pending');
  await page.locator('#admin-filter').selectOption('all');
  await page.waitForFunction(() => document.querySelectorAll('tbody [data-admin-action=video]').length === 4);
  assert.equal(await page.locator('tbody [data-admin-action=video]').count(), 4);
  assert.equal(new URL(page.url()).hash, '#videos');
  await page.locator('#admin-filter').selectOption('pending');
  await page.waitForFunction(() => document.querySelectorAll('tbody [data-admin-action=video]').length === 3);
  checks.push('Dashboard queue opens submitted/reviewing only; direct-link reload and all-status reset work.');

  await open('a');
  const review = page.locator('[data-review]'), reason = review.locator('[name=reason]');
  await submit('rejected');
  assert.equal(requests.length, 0); assert.equal((await focused()).name, 'reason');
  assert.match(await review.locator('[role=status]').textContent(), /3자/);
  await reason.fill('  가나  '); await submit('rejected');
  assert.equal(requests.length, 0, 'trimmed rejection reason is validated before a request');
  const note = '화면의 손과 작업 대상이 보입니다. 검수 메모 유지 확인';
  await reason.fill(note);
  service.store.run("UPDATE videos SET reviewStage='manual' WHERE id='a'");
  await submit('approved');
  await review.getByText(/심사 단계가 변경되었습니다/).waitFor();
  assert.equal(await reason.inputValue(), note, 'real 409 leaves the entered note intact');
  assert.equal(service.store.one("SELECT COUNT(*) count FROM reviews WHERE videoId='a'").count, 0);
  service.store.run("UPDATE videos SET reviewStage='ai' WHERE id='a'");
  await submit('approved'); await result('1단계');
  assert.equal((await focused()).id, 'b', 'success moves focus to the next pending row');
  assert.equal(service.store.one("SELECT reviewStage FROM videos WHERE id='a'").reviewStage, 'manual');
  assert.equal(service.store.one("SELECT COUNT(*) count FROM ledger WHERE userId='review-member'").count, 0);
  await page.locator('[data-refresh]').click();
  await page.waitForFunction(() => !document.querySelector('#admin-main').hasAttribute('aria-busy'));
  assert.match(await page.locator('.admin-review-feedback').innerText(), /1단계/);
  checks.push('Trimmed 3-character rejection validation, real stale-stage 409, memo preservation, persistent success feedback and next-row focus.');

  await open('b'); const before = requests.length;
  await submit('approved');
  assert.equal(requests.length, before); assert.equal((await focused()).name, 'framing');
  await page.screenshot({ path: path.join(output, 'review-validation-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'review validation dialog fits mobile viewport');
  await page.screenshot({ path: path.join(output, 'review-validation-390.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await review.locator('[name=framing]').check(); await submit('approved');
  assert.equal(requests.length, before); assert.equal((await focused()).name, 'hands');
  for (const field of ['hands', 'privacy', 'completion']) await review.locator(`[name=${field}]`).check();
  await reason.fill('네 가지 원본 검수 기준 확인');
  await submit('approved'); await result('2단계');
  assert.equal(service.store.one("SELECT reviewStage FROM videos WHERE id='b'").reviewStage, 'client');
  assert.equal(service.store.one("SELECT COUNT(*) count FROM ledger WHERE userId='review-member'").count, 0);
  await open('b'); await submit('approved'); await result('포인트 적립이 완료');
  assert.equal(service.store.one("SELECT COUNT(*) count FROM ledger WHERE userId='review-member'").count, 1);
  assert.equal(service.store.one("SELECT amount FROM ledger WHERE userId='review-member'").amount, task.reward);
  assert.equal(await page.locator('tbody [data-id=b]').count(), 0, 'approved item exits the pending queue');
  await open('d'); await reason.fill('손이 화면 밖에 있습니다. 촬영 구도를 조정해주세요.'); await submit('rejected'); await result('반려 사유를 저장');
  assert.equal(service.store.one("SELECT status FROM videos WHERE id='d'").status, 'rejected');
  assert.equal(await page.locator('tbody [data-id=d]').count(), 0);
  assert.equal((await focused()).id, 'a', 'last item wraps to remaining pending row');
  await page.screenshot({ path: path.join(output, 'review-queue-success-1440.png'), fullPage: true });
  checks.push('Four manual checks required before approval; unchanged stage transitions; final reward exactly once; rejection exits queue.');

  await page.goto(base + '/admin/#settings');
  const form = page.locator('.admin-welcome-popup form'); await form.waitFor();
  assert.match(await page.locator('.admin-settings-health').innerText(), /조회 완료/);
  assert.doesNotMatch(await page.locator('.admin-settings-health').innerText(), /연결됨|미연결/);
  assert.match(await form.locator('#admin-popup-save-note').innerText(), /이미 본 참여자/);
  await form.locator('[name=enabled]').check();
  await form.locator('[name=imageUrl]').fill('/app/icons/symbol.svg');
  await form.locator('[name=imageDecorative]').uncheck();
  await form.locator('[name=imageAlt]').fill('   ');
  await form.locator('[data-popup-preview]').click();
  assert.equal(await page.locator('.ego-welcome-dialog').count(), 0);
  assert.equal((await focused()).name, 'imageAlt');
  await form.locator('[name=imageAlt]').fill('촬영 구도 예시: 손과 작업 대상이 화면 가운데에 보여요.');
  await form.locator('[data-popup-preview]').click();
  await page.locator('.ego-welcome-dialog[open]').waitFor();
  assert.match(await page.locator('.ego-welcome-dialog img').getAttribute('alt'), /촬영 구도 예시/);
  await page.locator('.ego-welcome-close').click();
  await form.locator('[type=submit]').click(); await form.getByText(/팝업을 저장했습니다/).waitFor();
  let popup = (await (await context.request.get(base + '/api/admin/welcome-popup')).json()).popup;
  assert.match(popup.imageAlt, /촬영 구도 예시/);
  await form.locator('[name=imageDecorative]').check();
  await form.locator('[type=submit]').click(); await form.getByText(/팝업을 저장했습니다/).waitFor();
  popup = (await (await context.request.get(base + '/api/admin/welcome-popup')).json()).popup;
  assert.equal(popup.imageAlt, '');
  await form.locator('[data-popup-preview]').click(); await page.locator('.ego-welcome-dialog[open]').waitFor();
  assert.equal(await page.locator('.ego-welcome-dialog img').getAttribute('alt'), '');
  await page.locator('.ego-welcome-close').click();
  await form.locator('[name=enabled]').uncheck(); await form.locator('[name=imageDecorative]').uncheck();
  await form.locator('[type=submit]').click(); await form.getByText(/팝업을 저장했습니다/).waitFor();
  await page.screenshot({ path: path.join(output, 'settings-popup-1440.png'), fullPage: true });
  checks.push('Truthful data/configured status, adjacent re-exposure notice, required informative image text and decorative empty-alt round trip through real API.');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const hash of ['videos?status=pending', 'settings']) {
      await page.goto(base + '/admin/#' + hash); await page.locator('[data-refresh]').waitFor();
      if (hash === 'settings') await page.locator('.admin-welcome-popup form').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, hash + ' overflow at ' + width);
      await page.screenshot({ path: path.join(output, `${hash.startsWith('videos') ? 'queue' : 'popup'}-${width}.png`), fullPage: true });
    }
  }
  checks.push('320/390px updated queue and popup settings have no horizontal document overflow.');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ status: 'passed', checks, errors, reviewRequests: requests.length }, null, 2));
  console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close(); await service.close();
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(directory));
  if (!relative.startsWith('ego-admin-review-') || relative.includes(path.sep)) throw Error('Unexpected cleanup path');
  await rm(directory, { recursive: true, force: true });
}
