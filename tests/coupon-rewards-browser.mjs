import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/app.mjs';
import { digest } from '../server/security.mjs';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-coupon-test-'));
const origin = 'http://127.0.0.1:4597', service = createService({ directory, origin });
await new Promise(resolve => service.server.listen(4597, '127.0.0.1', resolve));
const at=service.store.now(),owner='coupon-member';
service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',owner,'coupon@example.test','unused','쿠폰 테스트','member',at,at);
service.store.run('INSERT INTO sessions VALUES(?,?,?,?,?)',digest('coupon-session'),owner,'coupon-csrf',Date.now()+600000,Date.now());
service.store.run('INSERT INTO ledger VALUES(?,?,?,?,?,?)','coupon-seed',owner,29999,'reward','coupon-seed',at);
const popup=JSON.parse(service.store.one('SELECT value FROM settings WHERE key=?','welcomePopup').value);
service.store.run('UPDATE settings SET value=? WHERE key=?',JSON.stringify({...popup,enabled:false}),'welcomePopup');
const browser=await chromium.launch({headless:true}),errors=[],metrics=[];
const figmaCouponStates=[];
async function captureFigmaCoupon(page,number){
 if(!process.env.FIGMA_AUDIT_DIR)return;
 const audit=process.env.FIGMA_AUDIT_DIR,out=path.join(audit,'runtime-coupons');await mkdir(out,{recursive:true});await page.setViewportSize({width:390,height:804});await page.evaluate(async()=>{await document.fonts.ready;for(const img of document.images)img.loading='eager';});await page.waitForFunction(()=>[...document.images].every(img=>img.complete));await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
 const source=JSON.parse(await readFile(path.join(audit,'structure.json'),'utf8')).screens.find(s=>Number(s.name.split('/')[1])===number),expected=source.nodes.find(n=>n.type==='TEXT'&&n.y>=90&&n.fontSize>=20);
 const actual=await page.locator(number===47?'.ego-insufficient-sheet .ego-form-hero h3':'.coupon-dialog h3').first().evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{text:el.innerText,x:r.x,y:r.y,w:r.width,h:r.height,fontSize:parseFloat(s.fontSize),fontWeight:parseFloat(s.fontWeight)}}),delta={x:actual.x-expected.x,y:actual.y-(expected.y-40),w:actual.w-expected.w,h:actual.h-expected.h,fontSize:actual.fontSize-expected.fontSize,fontWeight:actual.fontWeight-expected.fontName.variationSettings.wght};
 const evidence=path.join(out,String(number)+'.png');await page.screenshot({path:evidence});figmaCouponStates.push({number,nodeId:source.id,evidence,expected,actual,delta,fixture:'Disposable local service balance30000; real coupon test adapter, noSMS/noissuance/noactualdebit; selectedproductdynamic; receiptphoneprivacy-masked',verdict:Object.values(delta).some(n=>Math.abs(n)>6)?'FAIL':'PARTIAL'});await writeFile(path.join(out,'report.json'),JSON.stringify({states:figmaCouponStates},null,2));
}
try{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addCookies([{name:'dongjakso_session',value:'coupon-session',url:origin,httpOnly:true,sameSite:'Strict'}]);
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
  if(process.env.COUPON_NATIVE_OVERLAY&&!url.pathname.startsWith('/api/')){
   try{const file=path.resolve(process.env.COUPON_NATIVE_OVERLAY,url.pathname==='/app/'?'app/index.html':url.pathname.slice(1)),body=await readFile(file);return route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.png')?'image/png':'image/svg+xml'});}catch{}
  }return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/app/#wallet');await page.locator('[data-points-balance]').waitFor();
 const exchange=page.locator('[data-app-action="exchange-coupons"]');
 assert.equal(await exchange.isEnabled(),true,'below-threshold CTA explains requirements');await exchange.click();await page.locator('.ego-insufficient-sheet').waitFor();assert.equal(await page.locator('.coupon-dialog').count(),0,'29,999P cannot enter redemption');assert.equal(await page.locator('.ego-insufficient-sheet .app-button[disabled]').count(),1);await captureFigmaCoupon(page,47);await page.locator('.ego-insufficient-sheet [data-close]').click();
 service.store.run('INSERT INTO ledger VALUES(?,?,?,?,?,?)','coupon-threshold',owner,1,'reward','coupon-threshold',at);
 await page.evaluate(async()=> (await import('/app/service.js')).refreshApp());
 await page.waitForFunction(()=>document.querySelector('[data-points-balance]')?.textContent.includes('30,000'));
 assert.equal(await page.locator('text=국내 은행 연동').count(),0);
 for(const [width,height] of [[390,844],[320,667],[844,390]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
  const m=await page.locator('#app-main').evaluate(el=>({width:innerWidth,height:innerHeight,scroll:el.scrollHeight-el.clientHeight,overflow:document.documentElement.scrollWidth-innerWidth}));metrics.push(m);assert.ok(m.overflow<=1,JSON.stringify(m));await exchange.click({trial:true});await page.locator('a[href="#ledger"]').click({trial:true});
 }
 await page.setViewportSize({width:390,height:844});
 if(process.env.COUPON_OUTPUT){await mkdir(process.env.COUPON_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.COUPON_OUTPUT,'rewards.png')});}
 await exchange.click();
 await page.waitForFunction(()=>document.querySelectorAll('.coupon-product-card img').length===5&&[...document.querySelectorAll('.coupon-product-card img')].every(img=>img.complete&&img.naturalWidth>0));
 if(process.env.COUPON_OUTPUT)await page.screenshot({path:path.join(process.env.COUPON_OUTPUT,'catalogue.png')});
 await captureFigmaCoupon(page,43);assert.equal(await page.locator('[data-product]').count(),5);assert.equal(await page.locator('[data-coupon-next]').isDisabled(),true);
 await page.locator('[data-product="starbucks-americano"]').click();assert.match(await page.locator('[data-coupon-next]').innerText(),/4,900/);await page.locator('[data-coupon-next]').click();
 await captureFigmaCoupon(page,44);await page.locator('input[name=phone]').fill('123');await page.locator('[data-coupon-phone] button[type=submit]').click();assert.match(await page.locator('.coupon-error').innerText(),/확인/);
 await page.locator('input[name=phone]').fill('010-1234-5678');await page.locator('[data-coupon-phone] button[type=submit]').click();await page.locator('input[name=code]').waitFor();await captureFigmaCoupon(page,45);
 await page.locator('[data-coupon-resend]').click();assert.match(await page.locator('.coupon-error').innerText(),/문자 발송 없음/);
 await page.locator('input[name=code]').fill('7');await page.locator('[data-coupon-code] button[type=submit]').click();await page.locator('[data-coupon-done]').waitFor();await captureFigmaCoupon(page,46);
 assert.match(await page.locator('.coupon-complete').innerText(),/테스트 교환을\s+완료/);assert.match(await page.locator('[data-points-balance]').innerText(),/30,000/);await page.locator('[data-coupon-done]').click();
 const saved=await page.evaluate(async()=> (await import('/app/coupon-rewards.js')).couponTestHistory('coupon-member'));
 assert.equal(saved.length,1);assert.equal(saved[0].cost,4900);assert.equal(saved[0].phone,'010-****-5678');assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('01012345678')),false);
 await page.reload();await page.locator('[data-points-balance]').waitFor();await page.locator('a[href="#ledger"]').click();await page.getByText('테스트 교환 내역',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'스타벅스 아메리카노'}).count(),1);
 const rules=await page.evaluate(async()=>{
  const m=await import('/app/coupon-rewards.js'),reject=async fn=>{try{await fn();return false;}catch{return true;}};
  return {below:m.canExchange(29999),boundary:m.canExchange(30000),nan:m.canExchange(NaN),empty:await reject(()=>m.testCouponAdapter.verifyCode({test:true,phone:'01012345678',expiresAt:Date.now()+10000},'')),expired:await reject(()=>m.testCouponAdapter.verifyCode({test:true,phone:'01012345678',expiresAt:0},'1')),other:m.couponTestHistory('another-member').length};
 });assert.deepEqual(rules,{below:false,boundary:true,nan:false,empty:true,expired:true,other:0});
 if(process.env.SUBMISSION_FIXTURE){
  await page.evaluate(()=>{location.hash='guide/dishwashing/3';});
  await page.locator('[data-app-action="import"]').click();
  const upload=page.locator('.ego-upload-sheet');await upload.waitFor();
  assert.equal(await upload.locator('[data-local-records]').isVisible(),false);
  assert.equal(await upload.locator('select[name=taskId]').inputValue(),'dishwashing');
  await upload.locator('input[name=title]').fill('바로 제출 브라우저 검증');
  await upload.locator('input[name=file]').setInputFiles(process.env.SUBMISSION_FIXTURE);
  for(const box of await upload.locator('input[type=checkbox][required]').all())await box.check();
  await upload.locator('button[type=submit]').click();
  await page.locator('[data-submission-receipt]').waitFor({timeout:25000});
  await page.locator('[data-go-history]').click();
  await page.getByRole('heading',{name:'바로 제출 브라우저 검증'}).waitFor();
  assert.equal(await page.locator('.submission-card').count(),1);
  await page.locator('[data-app-action="view-submission"]').click();
  await page.locator('dialog video').waitFor();
  await page.waitForFunction(()=>document.querySelector('dialog video')?.readyState>=1);
  assert.equal(await page.locator('dialog video').evaluate(video=>Math.round(video.duration)),60);
  await page.locator('dialog [data-close]').click();
  const clips=await page.evaluate(async()=> (await import('/shared/store.js')).getClips());assert.equal(clips.length,0,'direct submit stores no local library record');
  await page.evaluate(()=>{location.hash='library';});await page.waitForFunction(()=>document.querySelector('#app-shell').dataset.screen==='reviews');
  await page.evaluate(()=>{location.hash='wallet';});await exchange.waitFor();
 }
 await page.evaluate(()=>{location.hash='wallet';});await exchange.waitFor();await exchange.click();await page.evaluate(async()=> (await import('/app/service.js')).logout());await page.locator('.coupon-dialog').waitFor({state:'detached'});assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',metrics,submissionPlayback:!!process.env.SUBMISSION_FIXTURE,checks:'threshold, catalogue, selection, phone validation, resend, arbitrary numeric OTP, test receipt, no debit, masked persistence, reload, account isolation, expiry, logout, responsive layout'}));
}finally{await browser.close();service.server.closeAllConnections();await service.close();await rm(directory,{recursive:true,force:true});}
