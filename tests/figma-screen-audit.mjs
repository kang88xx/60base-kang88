import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const audit=process.env.FIGMA_AUDIT_DIR||path.resolve('.artifacts/figma-audit');
const source=JSON.parse(await readFile(path.join(audit,'structure.json'),'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return readFile(new URL('./fixtures/figma-137-2484.json',import.meta.url),'utf8');})).screens;
assert.equal(source.length,64,'All source frames must exist before comparison');
const base=process.env.ALAN_QA_BASE||'http://127.0.0.1:5185';assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.claude/skills/gstack/node_modules/playwright/index.mjs')));
const out=path.join(audit,'runtime');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const report={createdAt:new Date().toISOString(),sourceCount:64,viewport:{width:390,height:804},sourceTopOffset:40,boxTolerance:6,fontTolerance:1,states:[],errors:[]};
const defs=[
 [1,'home','guest','.welcome-intro h1'],[8,'missions','guest','.alan-brand-hero h2'],[9,'home','member','.ego-home-intro h1'],[10,'first-filming','member','h1'],
 [11,'missions','member','.screen-heading h1'],[12,'missions','member','.result-count h1','search'],[13,'missions','member','.app-empty h2','empty-search'],
 [14,'activity/dishwashing','member','.screen-heading h1'],[15,'estimate','member','.screen-heading h1'],
 [16,'guide/dishwashing/1','member','.guide-heading h1'],[17,'guide/dishwashing/2','member','.guide-heading h1'],[18,'guide/dishwashing/3','member','.guide-heading h1'],
 [33,'reviews','member','.screen-heading h1'],[34,'reviews','empty','.app-empty h2'],
 [40,'wallet','member','.screen-heading h1'],[41,'ranking','member','h1'],[42,'ledger','member','h1'],
 [48,'profile','member','h1'],[49,'referrals','empty','.alan-brand-hero h2'],[50,'referrals','member','.alan-brand-hero h2','referral-pending'],[51,'referrals','member','.alan-brand-hero h2','referral-rewarded'],[52,'referrals/claim','empty','h1'],[53,'settings','member','.settings-section>h2'],
 [58,'announcements','member','.screen-heading h1'],[59,'announcements/qa_notice','member','h1'],[60,'support','member','.screen-heading h1'],[63,'wallet','member','.alan-brand-hero h2','offline'],[64,'wallet','member','h1','load-error']
];
const selected=process.env.FIGMA_AUDIT_SCREENS?.split(',').map(Number);
const contexts={};
async function contextFor(account){
 if(contexts[account])return contexts[account];const c=await browser.newContext({viewport:report.viewport,reducedMotion:'reduce',serviceWorkers:'block'});await c.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 if(account!=='guest'){const r=await c.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email:account==='empty'?'ego-empty@example.test':'ego-qa@example.test',password:'Local-Ego-QA-2026!'}});assert.equal(r.status(),200);}
 contexts[account]=c;return c;
}
const norm=value=>String(value).replace(/[\s.,·?!]/g,'');
try{
 for(const [number,route,account,headingSelector,action] of defs.filter(d=>!selected||selected.includes(d[0]))){
  const design=source.find(s=>Number(s.name.split('/')[1])===number),state={capturedAt:new Date().toISOString(),number,nodeId:design.id,name:design.name,route,fixture:account,expected:[],comparisons:[],gaps:[],evidence:path.join(out,`${String(number).padStart(2,'0')}.png`)};
  const p=await(await contextFor(account)).newPage();p.setDefaultTimeout(6000);p.on('pageerror',e=>report.errors.push({number,error:e.message}));
  try{
   if(action?.startsWith('referral-')){state.fixture='HTTP referral state fixture, real authenticated app';await p.route('**/api/referrals',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({code:'EGO2026',shareUrl:base+'/app/?ref=EGO2026',invitedCount:1,rewardedCount:action==='referral-rewarded'?1:0,earnedPoints:action==='referral-rewarded'?1000:0,canClaim:false,attribution:null})}));}
   if(action==='load-error')await p.route('**/api/me',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'현재 화면에서는 최신 제출 내역과 포인트를 확인하지 못했어요.'})}));
   await p.goto(base+`/app/?figma-audit=${number}#${route}`);await p.waitForFunction(()=>document.querySelector('#app-shell')?.dataset.screen&&document.querySelector('#app-shell').dataset.screen!=='loading');if(await p.locator('.app-launch-continue').isVisible())await p.locator('.app-launch-continue').click();await p.waitForLoadState('networkidle');await p.waitForTimeout(350);if(await p.locator('.ego-welcome-close').isVisible())await p.locator('.ego-welcome-close').click();
   state.actualScreen=await p.locator('#app-shell').getAttribute('data-screen');const expectedScreen=account==='guest'?(number===8?'login-required':'welcome'):route.split('/')[0];if(state.actualScreen!==expectedScreen)throw Error(`Missing distinct runtime surface: expected ${expectedScreen}; got ${state.actualScreen}`);
   if(['search','empty-search'].includes(action))await p.locator('#app-search').fill(action==='search'?'설거지':'문서 정리');
   if(action==='offline'){state.fixture='Authenticated member; real browser network offline after loaded app';await p.context().setOffline(true);await p.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});dispatchEvent(new Event('offline'))});await p.waitForTimeout(500);if(!await p.locator('[data-service-state=offline]').count())state.gaps.push('Offline event does not replace already-loaded private screen');await p.evaluate(async()=>{const m=await import('/studio/online-api.js');await m.refreshSession();});await p.locator('[data-service-state=offline]').waitFor();}
   if(action==='load-error')await p.locator('[data-service-state=error]').first().waitFor();
   if(action?.startsWith('referral-'))await p.locator('[data-referral-state='+action.slice(9)+']').waitFor();
   if(number===52){await p.locator('#referral-code-input').waitFor();assert.equal(await p.locator('#referral-claim-form').evaluate(f=>f.checkValidity()),false);}

   await p.evaluate(async()=>{await document.fonts.ready;for(const img of document.images){const r=img.getBoundingClientRect();if(r.width&&r.bottom>0&&r.top<innerHeight)img.loading='eager';}});await p.waitForFunction(()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width&&r.bottom>0&&r.top<innerHeight}).every(i=>i.complete));
   await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
   const expectedHeader=design.nodes.find(n=>n.type==='TEXT'&&n.y>=40&&n.y<90&&n.fontSize===15);
   const expectedHeading=design.nodes.find(n=>n.type==='TEXT'&&n.y>=90&&n.fontSize>=20);
   async function metric(label,selector,expected,{content=true,size=false}={}){
    if(!expected)return;const el=p.locator(selector+':visible').first();if(!await el.count()){state.gaps.push(`${label}: missing ${selector}`);return;}
    const actual=await el.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {text:el.innerText,x:r.x,y:r.y,w:r.width,h:r.height,fontSize:parseFloat(s.fontSize),fontWeight:parseFloat(s.fontWeight),display:s.display,color:s.color};});
    const target={nodeId:expected.id,text:expected.text,x:expected.x,y:expected.y-40,w:expected.w,h:expected.h,fontSize:expected.fontSize,fontWeight:expected.fontName?.variationSettings?.wght};const delta={x:actual.x-target.x,y:actual.y-target.y,w:actual.w-target.w,h:actual.h-target.h,fontSize:actual.fontSize-target.fontSize,fontWeight:target.fontWeight?actual.fontWeight-target.fontWeight:null};const failures=[];
    if(actual.display==='none'||!actual.w||!actual.h)failures.push('not visible');
    if(content&&norm(actual.text)!==norm(target.text))failures.push('static text mismatch');
    if(Math.abs(delta.x)>6||Math.abs(delta.y)>6)failures.push('origin differs >6px');
    if(size&&(Math.abs(delta.w)>6||Math.abs(delta.h)>6))failures.push('size differs >6px');
    if(expected.fontSize&&Math.abs(delta.fontSize)>1)failures.push('font differs >1px');
    if(target.fontWeight&&actual.fontWeight!==target.fontWeight)failures.push('font weight differs');
    state.comparisons.push({label,selector,expected:target,actual,delta,failures});
   }
   if(expectedHeader&&number!==9)await metric('header title','#app-header .header-title',expectedHeader);
   await metric('headline',headingSelector,expectedHeading,{size:true,content:![34,42,48,59].includes(number)});
   if(number===9){const image=design.nodes.find(n=>n.type!=='TEXT'&&n.x===264);await metric('home mascot','.alan-home-mascot',image,{content:false,size:true});}
   if(number===9){await metric('activity section title','.ego-activity-section .section-row h2',design.nodes.find(n=>n.text==='오늘의 촬영 활동'));await metric('first activity photo','.ego-mission-list img',design.nodes.find(n=>n.imageHashes?.length&&n.y===496),{content:false,size:true});}
   if([14,16,17].includes(number)){const photo=design.nodes.find(n=>n.imageHashes?.length&&n.w===350);await metric('reference image',number===14?'.alan-activity-photo':number===17?'.guide-frame-diagram':'.guide-visual img',photo,{content:false,size:true});}
   if(number===17)await metric('guide caution','.filming-guide > .muted-caption',design.nodes.find(n=>n.type==='TEXT'&&n.y===637),{size:true});
   if(number===40){const image=design.nodes.find(n=>n.type!=='TEXT'&&n.y===319);await metric('reward mascot','.alan-brand-art .alan-mascot-crop',image,{content:false,size:true});const amount=design.nodes.find(n=>n.fontSize===44);await metric('balance typography','[data-points-balance] .alan-hero-value',amount,{content:false});}
   if([42,48,59].includes(number))state.adaptation='User-owned or server-owned content comes from disposable fixture; geometry remains compared to Figma.';
   const expectedNav=design.children.some(n=>n.name==='EGO R3 / Navigation'),actualNav=await p.locator('.app-bottom-nav').isVisible();state.comparisons.push({label:'navigation presence',expected:expectedNav,actual:actualNav,failures:expectedNav===actualNav?[]:['navigation presence differs']});
   const expectedFixed=design.children.some(n=>n.name==='하단 고정 행동'),actualFixed=await p.locator('.screen-footer').count()>0;state.comparisons.push({label:'fixed action region',expected:expectedFixed,actual:actualFixed,failures:expectedFixed===actualFixed?[]:['fixed action structure differs']});
   state.assets=await p.locator('#app-main img').evaluateAll(imgs=>imgs.map(i=>{const r=i.getBoundingClientRect();return{src:i.getAttribute('src'),natural:[i.naturalWidth,i.naturalHeight],bounds:[r.x,r.y,r.width,r.height]}}));
   if(number===13&&!state.assets.some(i=>i.src?.includes('mascot')))state.gaps.push('Figma empty state mascot missing');
   state.bodyText=await p.locator('#app-main').innerText();await p.screenshot({path:state.evidence});
  }catch(error){state.gaps.push(error.message);await p.screenshot({path:state.evidence}).catch(()=>{});}finally{if(action==='offline')await p.context().setOffline(false);await p.close();}
  state.verdict=state.gaps.length||state.comparisons.some(c=>c.failures.length)?'FAIL':'PARTIAL';state.verdictMeaning=state.verdict==='PARTIAL'?'Measured anchors pass; full asset/content/state comparison still required':'Direct implementation mismatch or unavailable runtime surface';report.states.push(state);console.log(state.verdict,number,state.gaps.join('; '),state.comparisons.filter(c=>c.failures.length).map(c=>`${c.label}: ${c.failures.join(',')} Δ${JSON.stringify(c.delta||{})}`).join(' | '));
 }
}finally{await browser.close();if(selected){const prior=JSON.parse(await readFile(path.join(out,'geometry-report.json'),'utf8'));report.states=[...prior.states.filter(s=>!selected.includes(s.number)).map(s=>({...s,capturedAt:s.capturedAt||prior.createdAt})),...report.states].sort((a,b)=>a.number-b.number);report.errors=[...prior.errors.filter(e=>!selected.includes(e.number)),...report.errors];report.updatedScreens=selected;}await writeFile(path.join(out,'geometry-report.json'),JSON.stringify(report,null,2)+'\n');}
