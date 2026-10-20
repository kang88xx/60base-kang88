import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
let app = new URL('../mobile/overlays/ios-ego/app/', import.meta.url);
try { await access(new URL('app.js', app)); } catch { app = new URL('../app/', import.meta.url); }
const popup = (await readFile(new URL('welcome-popup.js', app), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const experience = await readFile(new URL('experience-ui.js', app), 'utf8');
const source = await readFile(new URL('app.js', app), 'utf8');
const home = experience.slice(experience.indexOf('export function homeScreen'), experience.indexOf('\nfunction progressCard')).replace('export ', '');
const settings = source.match(/^function settings\(state\).*$/m)[0];
const row = source.match(/^function row\(.*$/m)[0];
const browser = await chromium.launch({ headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
 await page.route('http://127.0.0.1:4398/**', route => route.fulfill({ contentType: 'text/html', body: '<main></main>' }));
 await page.goto('http://127.0.0.1:4398/#home');
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 await page.addScriptTag({ content: `const icon=()=>'', esc=String, getInstallState=()=>({}), isNativeApp=()=>false,appVersion=()=>'테스트'; ${popup}\n${home}\n${row}\n${settings}` });
 for (const [ctaPath, expected] of [['#missions','#missions'], ['#education','#education'], ['#guide/laundry/2','#guide/laundry/2'], ['#activity/laundry','#activity/laundry'], [undefined,'#missions'], ['', '#missions'], ['javascript:alert(1)','#missions'], ['https://evil.test','#missions'], ['#guide/laundry/4','#missions']]) {
  await page.evaluate(ctaPath => { location.hash = 'home'; popupDialog({ title:'시작 안내', ctaPath }, {onAction: route => {location.hash=route;}}); }, ctaPath);
  await page.locator('.ego-welcome-primary').click();
  await page.waitForURL(`**/${expected}`);
  await page.locator('.ego-welcome-dialog').waitFor({state:'detached'});
 }
 for (const action of ['dismiss','preview']) {
  await page.evaluate(action => { location.hash='home'; if(action==='preview') openWelcomePopupPreview({ctaPath:'#missions'}); else popupDialog({ctaPath:'#missions'},{onAction:route=>{location.hash=route;}}); }, action);
  await page.locator(action==='preview'?'.ego-welcome-primary':'.ego-welcome-close').click();
  await page.locator('.ego-welcome-dialog').waitFor({state:'detached'});
  assert.equal(new URL(page.url()).hash,'#home',`${action} does not navigate`);
 }
 await page.evaluate(() => { document.querySelector('main').innerHTML=homeScreen({}, {tasks:()=>[],activityCard:()=>'',categoryRail:()=>'',icon,ui:{category:'전체'}}); });
 assert.match(await page.locator('.ego-guide-banner').innerText(), /처음이라면, 여기부터/);
 await page.locator('.ego-guide-banner').click(); await page.waitForURL('**/#missions');
 await page.evaluate(() => {location.hash='settings';document.querySelector('main').innerHTML=settings({access:'allowed',user:{email:'member@example.test'}});});
 const guide = page.locator('.settings-row').filter({has:page.getByText('촬영 가이드',{exact:true})});
 assert.match(await guide.innerText(),/활동을 고른 뒤 세 단계/);
 await guide.click(); await page.waitForURL('**/#missions');
 await page.locator('.settings-row').filter({has:page.getByText('촬영 교육·점검',{exact:true})}).click();
 await page.waitForURL('**/#education?from=settings');
 assert.deepEqual(errors,[]);
 console.log('Filming entry routes passed: valid/custom/invalid/missing popup paths, dismissal/admin preview, home and settings activity selection, separate education entry.');
} finally { await browser.close(); }
