import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || resolve(homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:4335';
const server = process.env.STUDIO_TEST_URL ? null : spawn(process.execPath, ['dev-server.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: '4335' }, stdio: 'ignore' });
const out = resolve(process.env.STUDIO_REVIEW_DIR || '../.omx/reviews/studio-works-2026-09-10/local');
const checks = [];
let browser;

async function openPractice(page) {
  await page.locator('#capture-practice').waitFor();
  assert.equal(await page.locator('#capture-practice').getAttribute('open'), null, 'practice missions start collapsed');
  await page.locator('#capture-practice summary').click();
  await page.locator('#capture-practice #mission-search').waitFor();
}

try {
  for (let i = 0; i < 40; i += 1) {
    try { if ((await fetch(`${base}/studio/`)).ok) break; } catch {}
    await delay(100);
  }
  browser = await chromium.launch({ headless: true });
  await mkdir(out, { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/studio/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });

    await page.locator('.capture-dashboard').waitFor();
    assert.equal(await page.locator('.first-start').count(), 0, 'home no longer exposes the old three-step first-start block');
    assert.match(await page.locator('.capture-next').innerText(), /활동|촬영/i, 'home dashboard points to the next physical recording step');
    assert.equal((await page.locator('[data-nav="missions"] .nav-count').innerText()).trim(), '8');

    await page.locator('[data-nav="missions"]').click();
    await page.locator('#capture-search').waitFor();
    assert.equal(await page.locator('#capture-results .capture-task').count(), 8, 'missions route defaults to physical AI recording activities');
    await page.locator('#capture-search').fill('채소');
    assert.equal(await page.locator('#capture-results .capture-task').count(), 1);
    assert.match(await page.locator('#capture-results h3').innerText(), /채소/);
    assert.equal(await page.locator('#capture-search').evaluate(element => element === document.activeElement), true);
    await page.locator('#capture-reset').click();
    assert.equal(await page.locator('#capture-search').inputValue(), '');
    assert.equal(await page.locator('#capture-results .capture-task').count(), 8);

    await openPractice(page);
    assert.equal(await page.locator('#capture-practice #mission-results .mission-tile').count(), 6);
    assert.equal(await page.locator('#capture-practice #mission-count').getAttribute('aria-live'), 'polite');
    await page.locator('#capture-practice #mission-search').fill('수건');
    assert.equal(await page.locator('#capture-practice #mission-results .mission-tile').count(), 1);
    assert.match(await page.locator('#capture-practice #mission-results h3').innerText(), /수건/);
    assert.equal(await page.locator('#capture-practice #mission-search').evaluate(element => element === document.activeElement), true);
    await page.locator('#capture-practice #mission-search').fill('');
    await page.locator('#capture-practice [data-category="주방"]').click();
    await page.locator('#capture-practice #mission-duration').selectOption('3');
    await page.locator('#capture-practice #mission-level').selectOption('처음도 쉬워요');
    assert.equal(await page.locator('#capture-practice #mission-results .mission-tile').count(), 1);
    assert.match(await page.locator('#capture-practice #mission-results h3').innerText(), /여유를 담는 한 잔/);
    assert.equal(await page.locator('#capture-practice [data-category="주방"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#capture-practice #mission-results .mission-guide-link').click();
    await page.locator('dialog[open]').waitFor();
    assert.match(await page.locator('dialog[open]').innerText(), /여유를 담는 한 잔/);
    await page.locator('dialog [data-close], dialog [data-detail-close]').click();

    await page.locator('[data-nav="library"]').click();
    await page.locator('#record-search').fill('기록검색전용');
    await page.locator('[data-nav="missions"]').click();
    await openPractice(page);
    assert.equal(await page.locator('#capture-practice #mission-search').inputValue(), '');
    assert.equal(await page.locator('#capture-practice #mission-duration').inputValue(), '3');
    assert.equal(await page.locator('#capture-practice #mission-level').inputValue(), '처음도 쉬워요');
    assert.equal(await page.locator('#capture-practice #mission-results .mission-tile').count(), 1);
    await page.locator('#capture-practice #mission-search').fill('없는 검색어');
    assert.equal(await page.locator('#capture-practice #mission-results .mission-tile').count(), 0);
    await page.locator('#capture-practice [data-action="reset-mission-filter"]').click();
    assert.equal(await page.locator('#capture-practice #mission-search').inputValue(), '');
    assert.equal(await page.locator('#capture-practice #mission-duration').inputValue(), 'all');
    assert.equal(await page.locator('#capture-practice #mission-level').inputValue(), 'all');
    assert.equal(await page.locator('#capture-practice #mission-results .mission-tile').count(), 6);
    assert.equal(await page.locator('#capture-practice #mission-search').evaluate(element => element === document.activeElement), true);

    await page.locator('[data-nav="library"]').click();
    assert.equal(await page.locator('#record-search').inputValue(), '기록검색전용');
    await page.locator('[data-nav="guide"]').click();
    await page.locator('.capture-guide-context').waitFor();
    await page.locator('.training-path').waitFor();
    await page.locator('.submission-preflight').waitFor();
    assert.equal(await page.locator('.submission-preflight input[data-preflight]').count(), 4);
    await page.locator('.submission-preflight input[data-preflight]').first().check();
    assert.equal(await page.locator('.submission-preflight input[data-preflight]').first().isChecked(), true);
    assert.equal(await page.locator('.submission-preflight [data-action="collection-submit"]').count(), 1);
    assert.match(await page.locator('.submission-preflight').innerText(), /참여 희망|제출 전|촬영/);

    const saveFAQ = page.locator('details').filter({ has: page.locator('summary', { hasText: '저장하면 바로 심사에 제출되나요?' }) });
    await saveFAQ.locator('summary').click();
    assert.match(await saveFAQ.innerText(), /로컬 시연 심사에 제출|안내받은 경로/);
    const rewardFAQ = page.locator('details').filter({ has: page.locator('summary', { hasText: /보상을 실제로 받을 수 있나요?/ }) });
    await rewardFAQ.locator('summary').click();
    assert.match(await rewardFAQ.innerText(), /검수 기준을 통과한 경우 영상 1건당 3,000P|브라우저 안의 연습용 흐름/);

    for (const route of ['home', 'missions', 'guide']) {
      await page.locator(`[data-nav="${route}"]`).click();
      await page.waitForFunction(routeName => document.querySelector(`[data-nav="${routeName}"]`).getAttribute('aria-current') === 'page', route);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px ${route} overflow`);
      if ([390, 1440].includes(width)) await page.screenshot({ path: `${out}/${width}-${route}.png`, fullPage: true });
    }
    assert.equal(await page.locator('.submission-preflight input[data-preflight]:checked').count(), 1);
    assert.deepEqual(errors, []);
    checks.push(`${width}px: physical catalog, collapsed practice filters, route persistence, independent library search, guide process, reset/focus, FAQs, overflow and no runtime errors passed`);
    console.log('PASS', checks.at(-1));
    await context.close();
  }
  await writeFile(`${out}/report.json`, JSON.stringify({ url: base, status: 'passed', checks }, null, 2) + '\n');
} finally {
  await browser?.close();
  server?.kill();
}
