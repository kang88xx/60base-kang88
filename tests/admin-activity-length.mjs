import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serveConsole } from './helpers/console-proxy.mjs';

// 촬영 활동 page: each activity shows its own policy length (1분 / 10분) and reward (500P / 1,000P),
// read-only, against the operations backend that implements the 1-minute activities.
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
if (!process.env.EGO_BACKEND_DIR) throw new Error('Set EGO_BACKEND_DIR to a checkout of the operations backend (the directory that contains server/app.mjs).');
const backend = path.resolve(process.env.EGO_BACKEND_DIR);
if (!(await readFile(path.join(backend, 'server/app.mjs'), 'utf8')).includes('targetSeconds')) throw new Error(`${backend} has no per-activity targetSeconds yet`);
const { createService } = await import(pathToFileURL(path.join(backend, 'server/app.mjs')));
const { hashPassword } = await import(pathToFileURL(path.join(backend, 'server/security.mjs')));
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.resolve(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const output = path.resolve(repo, process.env.ADMIN_ACTIVITY_LENGTH_DIR || '.artifacts/admin-activity-length');
await mkdir(output, { recursive: true });
const port = Number(process.env.ADMIN_ACTIVITY_LENGTH_PORT || 4422), base = `http://127.0.0.1:${port}`, backendPort = port + 1;
const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-admin-activity-length-'));
const service = createService({ directory, origin: base });
await new Promise(resolve => service.server.listen(backendPort, '127.0.0.1', resolve));
const proxy = await serveConsole({ port, backendPort });
const password = 'Local-admin-length-only-2026!', at = service.store.now();
service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)', 'length-admin', 'length-admin@example.test', await hashPassword(password), '길이 관리자', 'admin', at, at);
// Converted activities keep the text stored before the change; participants are served it with the length rewritten.
service.store.run("UPDATE tasks SET instructions=replace(instructions,'1분 촬영','10분 촬영') WHERE id='cutting-vegetables'");
const task = id => service.store.one('SELECT * FROM tasks WHERE id=?', id);
// The length is policy, not a stored column: read it the way the console does, from the admin data the service sends.
const length = async id => (await (await context.request.get(base + '/api/admin/data')).json()).tasks.find(item => item.id === id)?.targetSeconds;
assert.match(task('cutting-vegetables').instructions, /10분 촬영/);
const served = (await (await fetch(base + '/api/catalog?durations=all')).json()).tasks.find(item => item.id === 'cutting-vegetables');
assert.match(served.instructions, /1분 촬영/); assert.doesNotMatch(served.instructions, /10분/);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
const errors = [], checks = [], saved = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (new URL(request.url()).pathname === '/api/admin/tasks' && request.method() === 'POST') saved.push(request.postDataJSON()); });
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
const settled = () => page.waitForFunction(() => !document.querySelector('#admin-main').hasAttribute('aria-busy') && !!document.querySelector('#admin-main [data-refresh]'));
const row = id => page.locator('tbody tr').filter({ has: page.locator(`[data-admin-action=task][data-id="${id}"]`) });
const cells = async id => (await row(id).locator('.admin-cell-value').allTextContents()).slice(2, 4);
const open = async id => { await page.locator(id ? `tbody [data-admin-action=task][data-id="${id}"]` : '.online-toolbar [data-admin-action=task]').click(); await page.locator('dialog[open]').waitFor(); return page.locator('dialog[open]'); };
const policy = dialog => dialog.locator('[data-task-policy] dd').allTextContents();
const submit = async dialog => { await dialog.locator('button[type=submit]').click(); await page.locator('dialog[open]').waitFor({ state: 'detached' }); await settled(); };
try {
  assert.equal((await context.request.post(base + '/api/auth/login', { headers: { Origin: base }, data: { email: 'length-admin@example.test', password } })).status(), 200);
  await page.goto(base + '/admin/#tasks'); await settled();
  assert.deepEqual(await page.locator('thead th').evaluateAll(cells => cells.map(cell => cell.dataset.adminHeaderLabel)), ['활동', '분류', '촬영 길이', '승인 포인트', '공개 상태', '관리']);
  for (const id of ['cutting-vegetables', 'shoe-organization', 'washing-laundry', 'desk-organizing', 'vacuuming']) assert.deepEqual(await cells(id), ['1분', '500P'], id);
  for (const id of ['dishwashing', 'folding-clothes']) assert.deepEqual(await cells(id), ['10분', '1,000P'], id);
  await page.screenshot({ path: path.join(output, 'tasks.png'), fullPage: true });
  checks.push('The table shows each activity\'s own length and reward (1분 · 500P and 10분 · 1,000P).');

  let dialog = await open('cutting-vegetables');
  assert.deepEqual(await policy(dialog), ['1분', '500P']);
  assert.equal(await dialog.locator('[name=reward]').count(), 0, 'no editable or hidden reward field');
  assert.equal(await dialog.locator('input[name=title]').getAttribute('readonly'), '', 'the policy title cannot be edited');
  assert.match(await dialog.locator('#admin-task-policy').textContent(), /활동명, 촬영 길이, 승인 포인트는 활동별 정책으로 정해지며 여기서 바꿀 수 없습니다\. 새 활동은 10분 · 1,000P입니다\./);
  assert.match(await dialog.locator('textarea[name=instructions]').inputValue(), /10분 촬영/, 'the stored text is shown as stored');
  assert.match(await dialog.locator('#admin-task-length-note').textContent(), /1분으로 바꿔 보여줍니다/);
  await page.screenshot({ path: path.join(output, 'task-1-minute.png') });
  // Even a title forced past the read-only field stays the policy title.
  await dialog.locator('input[name=title]').evaluate(input => { input.value = '다른 이름'; });
  await dialog.locator('input[name=category]').fill('주방 정리'); await submit(dialog);
  assert.equal('reward' in saved.at(-1), false, 'the console no longer sends a reward the server would overwrite');
  assert.deepEqual([task('cutting-vegetables').title, task('cutting-vegetables').category, task('cutting-vegetables').reward, await length('cutting-vegetables')], ['채소 손질', '주방 정리', 500, 60]);
  assert.deepEqual(await cells('cutting-vegetables'), ['1분', '500P']);
  checks.push('A 1-minute activity shows 1분 · 500P read-only, notes the participant length, and saving keeps the policy.');

  dialog = await open('dishwashing');
  assert.deepEqual(await policy(dialog), ['10분', '1,000P']);
  assert.equal(await dialog.locator('#admin-task-length-note').count(), 0); assert.equal(await dialog.locator('input[name=title]').getAttribute('readonly'), null);
  assert.match(await dialog.locator('#admin-task-policy').textContent(), /^촬영 길이와 승인 포인트는/);
  await dialog.locator('input[name=title]').fill('설거지하기'); await submit(dialog);
  assert.deepEqual([task('dishwashing').title, task('dishwashing').reward, await length('dishwashing')], ['설거지하기', 1000, 600]);
  dialog = await open('');
  assert.deepEqual(await policy(dialog), ['10분', '1,000P']);
  await dialog.locator('input[name=title]').fill('창문 닦기'); await dialog.locator('textarea[name=instructions]').fill('가로 화면으로 10분 촬영합니다.'); await submit(dialog);
  const added = service.store.one("SELECT * FROM tasks WHERE title='창문 닦기'");
  assert.deepEqual([added.reward, await length(added.id)], [1000, 600]); assert.deepEqual(await cells(added.id), ['10분', '1,000P']);
  checks.push('A 10-minute activity and a new activity show and keep 10분 · 1,000P.');

  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await settled();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'no horizontal page scroll at 390px');
  await page.screenshot({ path: path.join(output, 'tasks-390.png'), fullPage: true });
  dialog = await open('vacuuming');
  assert.equal(await page.evaluate(() => { const element = document.querySelector('dialog[open]'); return element.scrollWidth <= element.clientWidth && document.documentElement.scrollWidth <= document.documentElement.clientWidth; }), true, 'dialog fits at 390px');
  await page.screenshot({ path: path.join(output, 'task-dialog-390.png') });
  await dialog.locator('[data-close]').click();
  checks.push('Table and dialog fit 390px without horizontal overflow.');

  // The backend live today sends tasks without targetSeconds: every activity is then shown as 10 minutes.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await context.route('**/api/admin/data', async route => { const response = await route.fetch(), data = await response.json(); for (const item of data.tasks) delete item.targetSeconds; await route.fulfill({ response, json: data }); });
  await page.reload(); await settled();
  assert.deepEqual(await cells('dishwashing'), ['10분', '1,000P']); assert.deepEqual((await cells('vacuuming'))[0], '10분');
  dialog = await open('vacuuming');
  assert.deepEqual((await policy(dialog))[0], '10분'); assert.equal(await dialog.locator('#admin-task-length-note').count(), 0);
  await dialog.locator('[data-close]').click();
  checks.push('Without targetSeconds the page defaults to 10분 and still loads.');

  assert.deepEqual(errors, []);
  console.log(checks.map(check => 'ok - ' + check).join('\n'));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  console.error('Browser errors:', errors); throw error;
} finally {
  await browser.close(); await proxy.close(); await service.close(); await rm(directory, { recursive: true, force: true });
}
