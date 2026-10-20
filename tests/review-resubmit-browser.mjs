import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createService} from '../server/app.mjs';
import {digest} from '../server/security.mjs';
const audit=process.env.FIGMA_AUDIT_DIR||path.resolve('.artifacts/figma-audit'),out=path.join(audit,'runtime-resubmit');await mkdir(out,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.claude/skills/gstack/node_modules/playwright/index.mjs')));
const directory=await mkdtemp(path.join(os.tmpdir(),'ego-review-resubmit-')),base='http://127.0.0.1:4603',service=createService({directory,origin:base});
const owner='resubmit-fixture',at=service.store.now(),task=service.store.one('SELECT * FROM tasks WHERE id=?','dishwashing');
service.store.run('INSERT INTO users(id,email,password,name,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',owner,'resubmit@example.test','unused','재제출 검증',at,at);
service.store.run('INSERT INTO sessions VALUES(?,?,?,?,?)',digest('resubmit-local-session'),owner,'resubmit-local-csrf',Date.now()+600000,Date.now());
for(const status of ['uploaded','rejected','approved','reviewing']){
 const filename={uploaded:'dishwashing',rejected:'folding-clothes',approved:'cutting-vegetables',reviewing:'vacuuming'}[status],source=new URL('../assets/videos/collection/'+filename+'.mp4',import.meta.url),bytes=await readFile(source),sha=createHash('sha256').update(bytes).digest('hex');
 const id='resubmit-'+status;await copyFile(source,path.join(directory,'videos',id));
 service.store.run('INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,captureTask,path,sha,status,revision,createdAt,submittedAt,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,owner,task.id,'[로컬 검증] '+status,'original.mp4','video/mp4',bytes.length,60,1920,1080,task.reward,JSON.stringify(task),id,sha,status,status==='uploaded'?0:1,at,status==='uploaded'?null:at,status==='rejected'?'손과 작업 대상을 함께 담아주세요.':'');
}
const popup=JSON.parse(service.store.one('SELECT value FROM settings WHERE key=?','welcomePopup').value);service.store.run('UPDATE settings SET value=? WHERE key=?',JSON.stringify({...popup,enabled:false}),'welcomePopup');
await new Promise(resolve=>service.server.listen(4603,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:804},serviceWorkers:'block',reducedMotion:'reduce'});
await context.addCookies([{name:'dongjakso_session',value:'resubmit-local-session',url:base,httpOnly:true,sameSite:'Strict'}]);
await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
const page=await context.newPage();page.setDefaultTimeout(8000);
const expectedNumbers=(process.env.REVIEW_AUDIT_SCREENS||'35,36,37,38,39').split(',').map(Number);
const report={scope:'Actual /app list-to-detail clicks and real local API/SQL submission; seeded uploaded/rejected metadata and repository sample bytes; no mocked API responses, production writes or new uploads',checks:[],requests:[],states:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/')&&r.method()!=='GET')report.requests.push({method:r.method(),path:u.pathname,body:r.postDataJSON()});});
const structure=JSON.parse(await readFile(path.join(audit,'structure.json'),'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return readFile(new URL('./fixtures/figma-137-2484.json',import.meta.url),'utf8');}));
async function stable(){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});}

async function capture(number,dialog=page.locator('dialog[open]').last()){
 if(!expectedNumbers.includes(number))return;await stable();const frame=structure.screens.find(s=>Number(s.name.split('/')[1])===number),expected=frame.nodes.find(n=>n.type==='TEXT'&&n.y>=90&&n.fontSize>=20),expectedHeader=frame.nodes.find(n=>n.type==='TEXT'&&n.y===50),gaps=[];
 const index=await dialog.locator('h1,h2,h3').evaluateAll((els,text)=>els.findIndex(e=>e.innerText.replace(/\s/g,'')===text),expected.text.replace(/\s/g,''));
 let actual=null,delta=null;if(index<0)gaps.push('Source headline missing');else{actual=await dialog.locator('h1,h2,h3').nth(index).evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{text:e.innerText,x:r.x,y:r.y,w:r.width,h:r.height,fontSize:parseFloat(s.fontSize),fontWeight:parseFloat(s.fontWeight)}});delta={x:actual.x-expected.x,y:actual.y-(expected.y-40),w:actual.w-expected.w,h:actual.h-expected.h,fontSize:actual.fontSize-expected.fontSize,fontWeight:actual.fontWeight-expected.fontName.variationSettings.wght};if(['x','y','w','h'].some(k=>Math.abs(delta[k])>6))gaps.push('Source headline geometry differs >6px');if(Math.abs(delta.fontSize)>1||delta.fontWeight!==0)gaps.push('Source headline typography differs');}
 const layout=await dialog.evaluate(d=>{const r=d.getBoundingClientRect(),head=d.querySelector('.online-dialog-head'),h=head.getBoundingClientRect();return{fullPageClass:d.classList.contains('ego-r3-form-page'),dialog:{x:r.x,y:r.y,w:r.width,h:r.height},header:{h:h.height,text:head.querySelector('h2')?.innerText}}});
 if(!layout.fullPageClass||Math.abs(layout.dialog.x)>1||Math.abs(layout.dialog.y)>1||Math.abs(layout.dialog.w-390)>1||Math.abs(layout.dialog.h-804)>1)gaps.push('Dialog must fill390x804 content viewport');if(Math.abs(layout.header.h-50)>1)gaps.push('Header height differs from50px');if(layout.header.text!==expectedHeader.text)gaps.push('Source header text differs');
 const evidence=path.join(out,number+'.png');await page.screenshot({path:evidence});report.states.push({number,nodeId:frame.id,evidence,fixture:report.scope,expected,actual,delta,layout,verdict:gaps.length?'FAIL':'PARTIAL',gaps,verification:'Reached through real review list/detail controls; source40px OS inset excluded'});console.log('screen',number,gaps.length?'FAIL':'measured anchors PASS',JSON.stringify(delta),gaps.join('; '));
}
async function detail(id){await page.locator(`#app-main [data-app-action=view-submission][data-id="${id}"]`).click();await page.locator('dialog[open] [data-video-delete-request]').waitFor();assert.equal(await page.locator('dialog[open]').count(),1);}
try{
 await page.goto(base+'/app/#reviews');await page.locator('#app-main [data-app-action=view-submission]').first().waitFor();
 await detail('resubmit-reviewing');await capture(35);await page.locator('dialog[open] [data-close]').click();
 await detail('resubmit-approved');await capture(36);assert.equal(await page.locator('dialog[open] [data-app-action=resubmit]').count(),0,'approved video cannot resubmit');assert.equal(await page.locator('dialog[open] [data-app-action=submit-video]').count(),0);await page.locator('dialog[open] [data-close]').click();
 for(const status of ['uploaded','rejected']){
  const id='resubmit-'+status,before=service.store.one('SELECT * FROM videos WHERE id=?',id);await detail(id);
  const cta=page.locator(`dialog[open] [data-app-action=resubmit][data-id="${id}"]`);assert.equal(await cta.count(),1,'existing original resubmission must be user reachable');
  if(status==='rejected'){
   await capture(37);if(expectedNumbers.includes(39)){await page.locator('dialog[open] [data-video-delete-request]').click();await page.locator('dialog[open]').last().getByText('제출한 영상의 삭제를 요청할 수 있어요',{exact:false}).waitFor().catch(()=>{});await capture(39);const deletion=page.locator('dialog[open]').last();assert.match(await deletion.innerText(),/삭제.*완료|실제 삭제/);const mail=deletion.locator('.ego-review-bottom a[href^="mailto:"]');assert.match(await mail.getAttribute('href'),new RegExp(id));await mail.click({trial:true});await deletion.locator('[data-close]').click();if(await page.locator('dialog[open]').count())await page.locator('dialog[open] [data-close]').click();await detail(id);}
   await page.locator('dialog[open] [data-app-action=submit-video]').click();await page.locator('.ego-upload-sheet[open]').waitFor();assert.equal(await page.locator('dialog[open]').count(),1,'detail closes before new-video sheet');assert.equal(await page.locator('.ego-upload-sheet input[name=file]').count(),1);await page.locator('.ego-upload-sheet [data-close]').click();await detail(id);
  }
  await cta.click();const consent=page.locator('dialog[open]').filter({has:page.locator('input[name=filming]')});await consent.locator('button[type=submit]:not([disabled])').waitFor();assert.equal(await page.locator('dialog[open]').count(),1,'detail closes before consent');assert.equal(await consent.locator('input[type=checkbox]').count(),5);assert.equal(await consent.locator('input:checked').count(),0);
  if(status==='uploaded'){const back=consent.locator('.ego-form-back');assert.equal(await back.count(),1);await back.click();await consent.waitFor({state:'hidden'});await detail(id);await cta.click();await consent.locator('button[type=submit]:not([disabled])').waitFor();}
  const submitButton=consent.locator('button[type=submit]');await submitButton.click({trial:true});assert.ok((await submitButton.boundingBox()).height>=44,'submit touch target at least44px');await consent.locator('.online-dialog-body').evaluate(e=>e.scrollTop=0);
  await stable();const evidence=path.join(out,status==='rejected'?'38.png':'uploaded-consent.png');await page.screenshot({path:evidence});
  if(status==='rejected')await capture(38,consent);
  const priorRequests=report.requests.length;await consent.locator('button[type=submit]').click();assert.equal(report.requests.length,priorRequests,'unchecked consent cannot issue API request');assert.equal(service.store.one('SELECT revision FROM videos WHERE id=?',id).revision,before.revision);
  for(const name of ['filming','privacy','usage','training','recordedInKorea'])await consent.locator(`input[name=${name}]`).check();
  const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/videos/${id}/submit`&&r.request().method()==='POST');await consent.locator('button[type=submit]').click();const response=await responsePromise;assert.equal(response.status(),200);const payload=await response.json();assert.equal(payload.receipt.videoId,id);assert.equal(payload.receipt.revision,before.revision+1);await consent.waitFor({state:'hidden'});
  const after=service.store.one('SELECT * FROM videos WHERE id=?',id);assert.equal(after.status,'submitted');assert.equal(after.revision,before.revision+1);assert.equal(after.path,before.path);assert.equal(after.sha,before.sha);assert.equal(after.size,before.size);assert.equal(createHash('sha256').update(await readFile(path.join(directory,'videos',after.path))).digest('hex'),before.sha);assert.equal(service.store.one('SELECT count(*) n FROM videos').n,4);
  const requests=report.requests.filter(r=>r.path===`/api/videos/${id}/submit`);assert.equal(requests.length,1);assert.equal(requests[0].body.expectedRevision,before.revision);assert.ok(requests[0].body.idempotencyKey);for(const name of ['filming','privacy','usage','training','recordedInKorea'])assert.equal(requests[0].body[name],true);
  await page.waitForFunction(id=>document.querySelector(`#app-main [data-id="${id}"] .review-status-submitted`),id);report.checks.push(`${status}: list > detail > consent > real same-original submission; revision+1; unchanged file/hash; refreshed submitted status`);
 }
 assert.equal(report.requests.filter(r=>r.path.startsWith('/api/uploads')).length,0,'same-original flow must not initiate/upload/complete another media upload');assert.deepEqual(report.errors,[]);report.checks.push('approved video has no resubmit/new-version actions; rejected new-version entry opens real file selector; explicit five consents; zero upload requests');report.passed=true;report.visualPassed=report.states.length===expectedNumbers.length&&report.states.every(s=>s.gaps.length===0);
}catch(error){report.errors.push(error.stack||error.message);report.passed=false;throw error;}finally{await browser.close();service.server.closeAllConnections();await service.close();await rm(directory,{recursive:true,force:true});await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');if(report.visualPassed===false)process.exitCode=1;console.log(JSON.stringify({passed:report.passed,visualPassed:report.visualPassed,checks:report.checks,requests:report.requests.map(({method,path})=>({method,path})),errors:report.errors},null,2));}
