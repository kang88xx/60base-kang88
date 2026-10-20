import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';

// Only an explicitly local disposable service is accepted: this test changes
// saved activities and training state, logs in/out, but never submits content.
const base = process.env.ALAN_QA_BASE || 'http://127.0.0.1:5185';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const out = path.resolve('.artifacts/alan-redesign/qa');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
const page = await context.newPage();
page.setDefaultTimeout(8000);
const report = { generatedAt: new Date().toISOString(), base, checks: [], layouts: [], errors: [], httpFailures: [] };
page.on('pageerror', error => report.errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === base) report.httpFailures.push({status:response.status(),url:response.url()}); });
async function check(name, action) { try { await action(); report.checks.push({name,result:'PASS'});console.log('PASS',name); } catch(error) { report.checks.push({name,result:'FAIL',error:error.message});console.log('FAIL',name,error.message); await page.screenshot({path:path.join(out,`failure-${report.checks.length}.png`)}).catch(()=>{}); } }
async function ready(screen) {
  await page.waitForFunction(expected=>document.querySelector('#app-shell')?.dataset.screen===expected, screen);
  if(await page.locator('.app-launch-continue').isVisible()) await page.locator('.app-launch-continue').click();
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.app-loading').waitFor({state:'detached'});
}
async function go(route) { await page.evaluate(route=>{location.hash=route;},route); await ready(route.split('/')[0].split('?')[0]); }
async function shot(name) {
  await page.evaluate(()=>{for(const img of document.images){const r=img.getBoundingClientRect();if(r.width>0&&r.bottom>0&&r.top<innerHeight)img.loading='eager';}});
  await page.waitForFunction(()=>[...document.images].filter(img=>{const r=img.getBoundingClientRect();return r.width>0&&r.bottom>0&&r.top<innerHeight;}).every(img=>img.complete),null,{timeout:8000});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(img=>img.complete&&img.naturalWidth>0).map(img=>img.decode().catch(()=>{})));});
  await page.screenshot({path:path.join(out,name+'.png')});
}
async function layout(name) {
  const metrics = await page.evaluate(()=>{
    const main=document.querySelector('#app-main'), shell=document.querySelector('#app-shell');
    return {viewport:[innerWidth,innerHeight],documentOverflow:document.documentElement.scrollWidth-innerWidth,mainOverflow:main.scrollWidth-main.clientWidth,shellOverflow:shell.scrollWidth-shell.clientWidth,brokenImages:[...document.images].filter(img=>img.getBoundingClientRect().width>0&&img.complete&&!img.naturalWidth).map(img=>img.getAttribute('src'))};
  });
  report.layouts.push({name,...metrics});
  assert.ok(metrics.documentOverflow<=1&&metrics.mainOverflow<=1&&metrics.shellOverflow<=1,JSON.stringify(metrics));
  assert.deepEqual(metrics.brokenImages,[]);
}
try {
 await check('unauthenticated protected wallet remains welcome',async()=>{
   await page.goto(base+'/app/#wallet');await ready('welcome');assert.equal(await page.locator('.app-bottom-nav').isVisible(),false);assert.equal(await page.locator('[data-points-balance]').count(),0);await shot('welcome-390');await layout('welcome-390');
 });
 await check('real service login and home',async()=>{
   const response=await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email:process.env.ALAN_QA_EMAIL||'ego-qa@example.test',password:process.env.ALAN_QA_PASSWORD||'Local-Ego-QA-2026!'}});assert.equal(response.status(),200);
   await page.goto(base+'/app/#home');await page.reload();await ready('home');await page.waitForLoadState('networkidle');await page.waitForTimeout(400);if(await page.locator('.ego-welcome-close').isVisible()){await shot('welcome-popup-390');await page.locator('.ego-welcome-close').click();}await page.locator('.ego-mission-row').first().waitFor();assert.equal(await page.locator('.app-bottom-nav>a[data-tab]').count(),4);await shot('home-390');await layout('home-390');
 });
 await check('mission search empty state and reset',async()=>{
   await page.locator('.app-bottom-nav>a[data-tab=missions]').click();await ready('missions');const count=await page.locator('.task-card').count();assert.ok(count>0);await page.locator('#app-search').fill('QA_NO_SUCH_ACTIVITY_64981');await page.getByText('일치하는 활동이 없어요.',{exact:true}).waitFor();assert.equal(await page.locator('.task-card').count(),0);await shot('search-empty-390');await page.locator('[data-app-action=reset-search]').click();await page.locator('.task-card').first().waitFor();assert.equal(await page.locator('.task-card').count(),count);
 });
 await check('category, independent save, saved filter and reload persistence',async()=>{
   await page.locator('[data-category="주방"]').click();assert.equal(await page.locator('[data-category="주방"]').getAttribute('aria-pressed'),'true');assert.ok((await page.locator('.c01-meta').allTextContents()).every(text=>text.startsWith('주방')));
   const save=page.locator('[data-app-action=save-activity]').first(),id=await save.getAttribute('data-id');await save.click();assert.equal(await page.locator(`[data-app-action=save-activity][data-id="${id}"]`).getAttribute('aria-pressed'),'true');assert.equal(new URL(page.url()).hash,'#missions');await page.locator('[data-app-action=saved-filter]').click();assert.equal(await page.locator('.task-card').count(),1);await page.reload();await ready('missions');assert.equal(await page.locator(`[data-app-action=save-activity][data-id="${id}"]`).getAttribute('aria-pressed'),'true');await shot('missions-390');
 });
 await check('activity and all three guide steps use real links',async()=>{
   await page.locator('.task-card[href="#activity/dishwashing"]').click();await ready('activity');assert.equal(await page.locator('.app-bottom-nav').isVisible(),false);await shot('activity-390');await page.locator('.screen-footer a').click();await ready('guide');for(let step=1;step<=3;step++){assert.equal(new URL(page.url()).hash,`#guide/dishwashing/${step}`);await shot(`guide${step}-390`);await layout(`guide${step}-390`);if(step<3)await page.locator('.screen-footer a').click();}assert.equal(await page.locator('[data-app-action=import]').count(),1);assert.equal(await page.locator('[data-app-action=record]').count(),1);
 });
 await check('education answers and preflight persist and guide return works',async()=>{
   await page.locator('.guide-education-link').click();await ready('education');await page.locator('[data-prep-question=q1][data-prep-answer=portrait]').click();assert.match(await page.locator('.prep-question').first().innerText(),/다시 확인/);
   for(const [question,answer] of [['q1','landscape'],['q2','privacy'],['q3','natural']])await page.locator(`[data-prep-question=${question}][data-prep-answer=${answer}]`).click();await page.locator('[data-prep-action=complete-training]').click();for(const key of ['headgear','landscape','oneMinute','privacy'])await page.locator(`[data-prep-check=${key}]`).check();await page.reload();await ready('education');assert.match(await page.locator('.prep-quiz').innerText(),/교육 확인이 완료/);assert.equal(await page.locator('[data-prep-check]:checked').count(),4);await shot('education-complete-390');await page.locator('.prep-actions a[href="#guide/dishwashing/3"]').click();await ready('guide');assert.equal(new URL(page.url()).hash,'#guide/dishwashing/3');
 });
 await check('estimate validates count and never changes authoritative balance',async()=>{
   await go('wallet');const before=await page.locator('[data-points-balance]').innerText();await go('estimate');await page.locator('#app-estimate-count').fill('4');assert.match(await page.locator('#app-estimate-result').innerText(),/4,000/);await page.locator('#app-estimate-count').fill('21');assert.match(await page.locator('#app-estimate-result').innerText(),/1~20/);await page.locator('#app-estimate-count').fill('4');await shot('estimate-390');await go('wallet');assert.equal(await page.locator('[data-points-balance]').innerText(),before);assert.equal(await page.locator('[data-app-action=exchange-coupons]').isDisabled(),true);
 });
 await check('reviews query and status filters do not fabricate submissions',async()=>{
   await go('reviews');await page.locator('#app-review-search').fill('QA_NO_SUCH_VIDEO');assert.equal(await page.locator('.submission-card').count(),0);for(const button of await page.locator('[data-review-filter]').all()){await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');}await shot('reviews-390');
 });
 await check('settings support/announcements links preserve return route',async()=>{
   await go('profile');await page.locator('#app-header a[href="#settings"]').click();await ready('settings');await page.locator('a[href="#support?from=settings"]').click();await ready('support');await page.locator('[data-new-ticket]').click();await page.locator('dialog[open] input[name=subject]').waitFor();assert.equal(await page.locator('dialog[open] form').evaluate(form=>form.checkValidity()),false);await shot('support-form-390');await page.locator('dialog[open] [data-close]').click();await shot('support-390');await page.locator('#app-header a[aria-label="이전 화면"]').click();await ready('settings');await page.locator('a[href="#announcements?from=settings"]').click();await ready('announcements');const summary=page.locator('.app-announcements summary');if(await summary.count()){await summary.first().click();assert.equal(await summary.first().evaluate(el=>el.parentElement.open),true);}await shot('announcements-390');await page.locator('#app-header a[aria-label="이전 화면"]').click();await ready('settings');
 });
 const routes=['home','missions','activity/dishwashing','guide/dishwashing/1','guide/dishwashing/2','guide/dishwashing/3','education/dishwashing/3','estimate','reviews','wallet','profile','settings','support','announcements'];
 for(const [width,height] of [[390,844],[320,667],[430,932],[844,390]]){
   await page.setViewportSize({width,height});
   for(const route of routes)await check(`layout ${route} ${width}x${height}`,async()=>{await go(route);await page.waitForTimeout(75);const name=`${route.replaceAll('/','-')}-${width}`;await layout(name);await shot(name);});
 }
 for(const [width,height] of [[320,667],[844,390]]){
   await page.setViewportSize({width,height});
   for(const [route,selector] of [['home','[data-app-action=save-activity]'],['missions','a[href="#education"]'],['guide/dishwashing/3','.guide-education-link'],['education/dishwashing/3','.prep-actions a[href="#guide/dishwashing/3"]'],['settings','.settings-footer a']])await check(`bottom action reachable ${route} ${width}x${height}`,async()=>{await go(route);await page.locator(selector).last().click({trial:true});await shot(`bottom-${route.replaceAll('/','-')}-${width}`);});
 }
 await check('logout removes member UI and protected deep links stay gated',async()=>{
   await page.setViewportSize({width:390,height:844});await go('settings');await page.locator('[data-app-action=logout]').click();await ready('welcome');await page.evaluate(()=>{location.hash='wallet';});await ready('welcome');assert.equal(await page.locator('[data-points-balance]').count(),0);assert.equal(await page.locator('.app-bottom-nav').isVisible(),false);
 });
 for(const [width,height] of [[320,667],[430,932],[844,390]])await check(`welcome layout and email action reachable ${width}x${height}`,async()=>{await page.setViewportSize({width,height});await ready('welcome');await layout(`welcome-${width}`);await page.locator('[data-app-action=login]').last().click({trial:true});await shot(`welcome-${width}`);});
 await check('no uncaught browser exceptions',async()=>assert.deepEqual(report.errors,[]));
} finally {
 await browser.close();
 report.result=report.checks.some(check=>check.result==='FAIL')?'FAIL':'PASS';
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({result:report.result,checks:report.checks.length,failures:report.checks.filter(check=>check.result==='FAIL'),errors:report.errors,httpFailures:report.httpFailures,report:path.join(out,'report.json')},null,2));
 if(report.result==='FAIL')process.exitCode=1;
}
