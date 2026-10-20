import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const base=process.env.ALAN_QA_BASE||'http://127.0.0.1:5185';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.claude/skills/gstack/node_modules/playwright/index.mjs')));
const out=path.resolve('.artifacts/alan-redesign/qa');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const context=await browser.newContext({viewport:{width:844,height:390},permissions:['camera','microphone'],reducedMotion:'reduce',serviceWorkers:'block'});
await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
// Chromium's synthetic camera has no optical zoom. Expose simulated supported
// track constraints while retaining its real MediaStream + MediaRecorder.
await context.addInitScript(()=>{
 const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 navigator.mediaDevices.getUserMedia=async constraints=>{
  const stream=await original(constraints);
  for(const track of stream.getVideoTracks()){
   let zoom=1;const settings=track.getSettings.bind(track),capabilities=track.getCapabilities.bind(track),apply=track.applyConstraints.bind(track);
   track.getCapabilities=()=>({...capabilities(),zoom:{min:.5,max:2,step:.5}});
   track.getSettings=()=>({...settings(),zoom});
   track.applyConstraints=async value=>{const requested=value.advanced?.find(item=>'zoom'in item)?.zoom;if(requested!==undefined){zoom=requested;return;}return apply(value);};
  }
  return stream;
 };
});
const page=await context.newPage();page.setDefaultTimeout(8000);
const report={generatedAt:new Date().toISOString(),checks:[],errors:[],scope:'Real camera controller with Chromium synthetic MediaStream/MediaRecorder; simulated zoom capability and CSS safe areas; no saving/submission'};
page.on('pageerror',error=>report.errors.push(error.message));
const login=await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email:process.env.ALAN_QA_EMAIL||'ego-qa@example.test',password:process.env.ALAN_QA_PASSWORD||'Local-Ego-QA-2026!'}});assert.equal(login.status(),200);
try{
 await page.goto(base+'/app/#guide/dishwashing/3');await page.waitForFunction(()=>document.querySelector('#app-shell')?.dataset.screen==='guide');await page.waitForLoadState('networkidle');if(await page.locator('.ego-welcome-close').isVisible())await page.locator('.ego-welcome-close').click();
 const hrefs=await page.locator('link[rel=stylesheet]').evaluateAll(links=>links.map(link=>new URL(link.href).pathname));
 const css=(await Promise.all(hrefs.map(href=>readFile(path.resolve('.'+href),'utf8')))).join('\n');
 for(const [width,height] of [[844,390],[667,375],[568,320],[1024,768]])for(const safe of [false,true]){
  await page.setViewportSize({width,height});
  let safeStyle;if(safe)safeStyle=await page.addStyleTag({content:css.replaceAll('env(safe-area-inset-left)','44px').replaceAll('env(safe-area-inset-right)','44px').replaceAll('env(safe-area-inset-bottom)','21px').replaceAll('env(safe-area-inset-top)','0px')});
  await page.locator('[data-app-action=record]').click();await page.locator('.studio-camera-dialog[data-state=ready]').waitFor();await page.locator('[data-camera-zoom]:not([hidden])').waitFor();
  for(const state of ['ready','recording']){
   if(state==='recording'){await page.locator('.studio-camera-dialog [data-record]').click();await page.locator('.studio-camera-dialog[data-state=recording]').waitFor();}
   await page.locator('button[data-zoom="2"]').click();await page.waitForFunction(()=>document.querySelector('button[data-zoom="2"]')?.getAttribute('aria-pressed')==='true');
   const metrics=await page.evaluate(()=>{
    const rect=selector=>{const element=document.querySelector(selector),r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,hidden:element.hidden,display:getComputedStyle(element).display,hit:element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};};
    return {timer:rect('[data-timer]'),zoom:rect('[data-camera-zoom]'),shutter:rect(document.querySelector('[data-record]').hidden?'[data-stop]':'[data-record]'),preview:rect('.studio-camera-live'),bottomTransform:getComputedStyle(document.querySelector('.studio-camera-bottom')).transform,zoomButtons:[...document.querySelectorAll('button[data-zoom]')].map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})};
   });
   const name=`camera-${state}-${width}-${safe?'safe':'plain'}`;await page.screenshot({path:path.join(out,name+'.png')});
   const failures=[];const verify=(condition,message)=>{if(!condition)failures.push(message);};
   verify(metrics.preview.width===width&&metrics.preview.height===height,'preview must fill viewport');
   verify(metrics.timer.width>0&&metrics.timer.height>0&&Math.abs(metrics.timer.x+metrics.timer.width/2-width/2)<1,'timer must be visible and horizontally centered');
   verify(metrics.zoom.width>0&&Math.abs(metrics.zoom.x+metrics.zoom.width/2-width/2)<1,'zoom must be horizontally centered');
   verify(metrics.zoom.bottom<=height-(safe?21:0)&&metrics.zoom.y>height/2,'zoom must sit above bottom safe area');
   verify(metrics.shutter.hit&&metrics.shutter.x>width*.7&&metrics.shutter.right<=width-(safe?44:20)+1,'shutter must be reachable on right within safe area');
   verify(metrics.zoomButtons.every(button=>button.width>=44&&button.height>=44&&button.hit),'zoom targets must be >=44px and reachable');
   report.checks.push({name,result:failures.length?'FAIL':'PASS',failures,metrics});console.log(failures.length?'FAIL':'PASS',name,failures.join('; '));
  }
  await page.evaluate(async()=>{(await import('/studio/camera.js')).closeStudioCamera();});await page.locator('.studio-camera-dialog').waitFor({state:'detached'});
  if(safeStyle)await safeStyle.evaluate(el=>el.remove());
 }
}catch(error){report.errors.push(error.stack||error.message);throw error;}finally{
 await browser.close();report.result=report.checks.some(check=>check.result==='FAIL')||report.errors.length?'FAIL':'PASS';await writeFile(path.join(out,'camera-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,checks:report.checks.length,errors:report.errors,failures:report.checks.filter(check=>check.result==='FAIL').map(({name,failures})=>({name,failures}))},null,2));if(report.result==='FAIL')process.exitCode=1;
}
