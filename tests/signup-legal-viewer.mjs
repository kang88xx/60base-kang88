import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const root = new URL('../', import.meta.url);
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({viewport:{width:390,height:844}});
 await page.route('https://legal.test/**', async route => {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname === '/app/') return route.fulfill({contentType:'text/html; charset=utf-8',body:'<dialog id="signup"><form><input name="displayName" value="내 이름"><input name="adult" type="checkbox" checked><input name="terms" type="checkbox"><input name="privacy" type="checkbox"><a href="/studio/terms.html" id="terms">약관</a><a href="/studio/privacy.html" id="privacy">개인정보</a><button type="submit">가입 완료</button></form></dialog><script type="module">import {bindSignupLegalViewer} from "/studio/legal-viewer.js";window.submits=0;window.nativeClicks=0;signup.addEventListener("submit",e=>{e.preventDefault();submits++});bindSignupLegalViewer(signup);document.addEventListener("click",e=>{if(e.target.closest("a[href]"))nativeClicks++});signup.showModal();window.ready=true;</script>'});
  try { await route.fulfill({contentType:pathname.endsWith('.js')?'text/javascript; charset=utf-8':pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8',body:await readFile(new URL('.'+pathname,root),'utf8')}); } catch { await route.fulfill({status:404,body:''}); }
 });
 await page.goto('https://legal.test/app/'); await page.waitForFunction(()=>window.ready);
 for (const [id,text] of [['terms','현재 기본 활동은 영상당 1,000P'],['privacy','삭제 요청 후 7일 이내']]) {
  await page.click('#'+id);
  await page.locator('.legal-body [data-legal-content]').waitFor();
  assert.match(await page.locator('.legal-body').innerText(),new RegExp(text));
  assert.equal(await page.evaluate(()=>nativeClicks),0,'signup links must not reach native external-link navigation');
  assert.equal(await page.evaluate(()=>submits),0);
  await page.locator('.legal-body').evaluate(el=>el.scrollTop=el.scrollHeight);
  assert.equal(await page.locator('.legal-footer button').isVisible(),true,'close remains visible after scrolling');
  await page.locator('.legal-footer button').click();
  assert.equal(await page.locator('#signup').evaluate(el=>el.open),true);
  assert.equal(await page.locator('[name=displayName]').inputValue(),'내 이름');
  assert.equal(await page.locator('[name=adult]').isChecked(),true);
  assert.equal(await page.locator('[name=terms]').isChecked(),false);
  assert.equal(await page.locator('[name=privacy]').isChecked(),false);
  assert.equal(await page.evaluate(()=>submits),0);
 }
 await page.click('#terms'); await page.locator('.legal-body [data-legal-content]').waitFor();
 await page.keyboard.press('Escape'); await page.locator('.legal-sheet').waitFor({state:'detached'});
 await page.click('#privacy'); await page.locator('.legal-body [data-legal-content]').waitFor();
 await page.locator('.legal-close').click(); await page.locator('.legal-sheet').waitFor({state:'detached'});
 await page.setViewportSize({width:844,height:390});
 await page.click('#terms'); await page.locator('.legal-body [data-legal-content]').waitFor();
 const rect=await page.locator('.legal-sheet').boundingBox(); assert.equal(rect.width,844); assert.equal(rect.height,390);
 await page.goto('https://legal.test/studio/privacy.html');
 await page.locator('.legal-header').waitFor();
 assert.match(await page.locator('.legal-body').innerText(),/2026-09-14-google-v1/);
 assert.equal(await page.locator('.legal-body a[href="https://legal.test/studio/delete-account.html"]').count(),0); // relative links retain their valid standalone destination.
 assert.equal(await page.locator('.legal-body a[href="delete-account.html"]').count(),2);
 await page.locator('.legal-footer button').click(); await page.waitForURL('https://legal.test/app/');
 // Exercise the real signup component with a deterministic account boundary.
 const componentSources = [await readFile(new URL('../studio/cloud-account-ui.js', import.meta.url), 'utf8')];
 try { componentSources.push(await readFile(new URL('../mobile/overlays/ios-ego/studio/cloud-account-ui.js', import.meta.url), 'utf8')); } catch (error) { if(error.code!=='ENOENT')throw error; }
 let appIndex;
 try { appIndex=await readFile(new URL('../mobile/overlays/ios-ego/app/index.html',import.meta.url),'utf8'); }
 catch(error) { if(error.code!=='ENOENT')throw error; appIndex=await readFile(new URL('../app/index.html',import.meta.url),'utf8'); }
 const styles=[...appIndex.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)].map(match=>`<link rel="stylesheet" href="${new URL(match[1],'https://signup.test/app/').pathname}">`).join('');
 for (const componentSource of componentSources) {
  await page.route('https://signup.test/**', async route => {
   const pathname = new URL(route.request().url()).pathname;
   if(pathname==='/app/')return route.fulfill({contentType:'text/html',body:`<div id="app-shell"></div>${styles}<script type="module">import {showCloudAccount} from "/studio/cloud-account-ui.js";showCloudAccount();</script>`});
   if(pathname==='/app/ego-icons.js')return route.fulfill({contentType:'text/javascript',body:'export const icon=()=>"";'});
   if(pathname==='/studio/cloud-account-ui.js')return route.fulfill({contentType:'text/javascript',body:componentSource});
   if(pathname==='/studio/cloud-account.js')return route.fulfill({contentType:'text/javascript',body:`let listener;const state={availability:'ready',phase:'registrationRequired',user:{uid:'preview',email:'preview@example.test',displayName:'미리보기'},busy:false};window.accountFixture={submissions:[],setBusy(busy){state.busy=busy;listener(state);}};export const getCloudAccount=()=>state;export const subscribeCloudAccount=fn=>{listener=fn;fn(state);return()=>{};};export const appleSignInEnabled=false;export const continueWithGoogle=()=>Promise.resolve();export const continueWithApple=()=>Promise.resolve();export const signOutCloudAccount=()=>Promise.resolve();export const retryCloudAccount=()=>Promise.resolve();export const completeRegistration=body=>{window.accountFixture.submissions.push(body);return Promise.reject({code:'cloud/invalid-name'});};`});
   if(pathname==='/studio/online-api.js')return route.fulfill({contentType:'text/javascript',body:`export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));export function dialog(title,content){const element=document.createElement('dialog');element.className='online-dialog';element.innerHTML='<div class="online-dialog-head"><h2>'+title+'</h2><button data-close>닫기</button></div><div class="online-dialog-body">'+content+'</div>';document.body.append(element);element.querySelector('[data-close]').onclick=()=>element.close();element.addEventListener('close',()=>element.remove());element.showModal();return element;}`});
   if(pathname.startsWith('/app/')&&pathname.endsWith('.css')) {
    try { return await route.fulfill({contentType:'text/css',body:await readFile(new URL('../mobile/overlays/ios-ego'+pathname,import.meta.url),'utf8')}); }
    catch(error) { if(error.code!=='ENOENT')throw error; }
   }
   try { await route.fulfill({contentType:pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html',body:await readFile(new URL('.'+pathname,root),'utf8')}); } catch { await route.fulfill({status:404,body:''}); }
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto('https://signup.test/app/');
  const form=page.locator('#cloud-registration-form'),submit=form.locator('[type=submit]');
  await form.waitFor();
  assert.equal(await page.locator('#cloud-account-dialog').evaluate(el=>el.classList.contains('cloud-signup-design-two')),true);
  const colors=await page.locator('#cloud-account-dialog').evaluate(el=>({background:getComputedStyle(el).backgroundColor,title:getComputedStyle(el.querySelector('.cloud-signup-title')).color,brand:getComputedStyle(el.querySelector('.online-dialog-head h2')).color,close:getComputedStyle(el.querySelector('[data-close]')).color,closeBackground:getComputedStyle(el.querySelector('[data-close]')).backgroundColor,titleAlign:getComputedStyle(el.querySelector('.cloud-signup-title')).textAlign}));
  assert.equal(colors.background,'rgb(36, 93, 255)','full production stylesheet cascade preserves blue signup header');
  assert.equal(colors.title,'rgb(255, 255, 255)');assert.equal(colors.brand,'rgb(255, 255, 255)');assert.equal(colors.close,'rgb(255, 255, 255)');assert.equal(colors.closeBackground,'rgba(0, 0, 0, 0)');assert.equal(colors.titleAlign,'left');
  assert.equal(await submit.isDisabled(),true);
  for(const name of ['adult','terms','privacy'])await form.locator(`[name=${name}]`).check();
  assert.equal(await submit.isEnabled(),true);
  await form.locator('[name=displayName]').fill('   ');
  assert.equal(await submit.isDisabled(),true,'whitespace-only name keeps CTA disabled');
  await form.evaluate(el=>el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(await page.evaluate(()=>accountFixture.submissions.length),0,'invalid form cannot submit programmatically');
  await form.locator('[name=displayName]').fill('보존할 이름');
  await page.evaluate(()=>accountFixture.setBusy(true));
  assert.equal(await submit.isDisabled(),true);
  assert.equal(await form.locator('[name=displayName]').isDisabled(),true);
  await form.evaluate(el=>el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(await page.evaluate(()=>accountFixture.submissions.length),0,'busy form cannot submit');
  await page.evaluate(()=>accountFixture.setBusy(false));
  await form.locator('a[href="/studio/terms.html"]').click();
  await page.locator('.legal-body [data-legal-content]').waitFor();
  await page.locator('.legal-footer button').click();
  assert.equal(await form.locator('[name=displayName]').inputValue(),'보존할 이름');
  for(const name of ['adult','terms','privacy'])assert.equal(await form.locator(`[name=${name}]`).isChecked(),true);
  await submit.click();
  await page.waitForFunction(()=>accountFixture.submissions.length===1);
  await page.waitForFunction(()=>document.querySelector('[data-cloud-error]').dataset.error==='true');
  assert.equal(await form.locator('[name=displayName]').inputValue(),'보존할 이름','error preserves the entered name');
  for(const name of ['adult','terms','privacy'])assert.equal(await form.locator(`[name=${name}]`).isChecked(),true,'error preserves consents');
  assert.equal(await submit.isEnabled(),true,'error restores usable submit');
  assert.equal(await page.locator('.online-dialog-head [data-close]').isVisible(),true);
  await page.unroute('https://signup.test/**');
 }
 console.log('Signup legal viewer: full legal text, exact path interception, preserved form/consents, no signup, footer/X/Escape close, landscape and standalone rendering; selected signup2 CTA validation, busy/invalid submission blocking, legal/error draft preservation passed.');
} finally { await browser.close(); }
