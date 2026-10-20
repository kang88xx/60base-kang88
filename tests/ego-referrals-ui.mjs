import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const base = new URL('../app/', import.meta.url);
let state = { accountKey:'a', user:{id:'a'}, access:'allowed' }, subscriber;
let calls = [], pending = [];
const context = vm.createContext({ URLSearchParams, AbortController, Date, Set, location:{search:'?ref=FRIEND'}, navigator:{},
 api:(path,options={})=>{calls.push({path,...options});return new Promise((resolve,reject)=>pending.push({resolve,reject}));},
 esc:v=>String(v??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),getAppState:()=>state, subscribeApp:cb=>{subscriber=cb;},canEnterApp:s=>s.access==='allowed' });
const source = (await readFile(new URL('referrals.js',base),'utf8')).replace(/^import .*;\n/gm,'').replaceAll('export ','');
const experience=(await readFile(new URL('experience-ui.js',base),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const apiSource=await readFile(new URL('../studio/online-api.js',base),'utf8');
vm.runInContext(apiSource.split('\n').find(line=>line.startsWith('export const points=')).replace('export ',''),context);
vm.runInContext(experience,context);
vm.runInContext(source+'\nglobalThis.subject={getReferrals,setReferralDraft,refreshReferrals,claimReferral,shareReferral,referralCard};',context);
const ui=context.subject, settle=()=>new Promise(resolve=>setImmediate(resolve));
const payload = {code:'EGO-A',shareUrl:'https://60base.ai/app/?ref=EGO-A',rewardPoints:1000,invitedCount:2,rewardedCount:1,earnedPoints:1000,canClaim:true,attribution:null};
assert.equal(ui.getReferrals().draft,'FRIEND'); assert.equal(calls.length,0,'URL must never silently claim');
subscriber(state); assert.equal(calls[0].path,'/referrals'); pending.shift().resolve(payload);await settle();
assert.match(ui.referralCard(),/href="#referrals\/claim"/,'Eligible users can reach claim even after earning outgoing invitation rewards');
assert.match(ui.referralCard(ui.getReferrals(),{claim:true}),/이 초대 코드 등록하기/); assert.match(ui.referralCard(),/1,000P/);
for(const [invitedCount,rewardedCount] of [[0,0],[1,0],[2,1]]){
 assert.match(ui.referralCard({...ui.getReferrals(),data:{...payload,invitedCount,rewardedCount}}),/href="#referrals\/claim"/,'Every eligible outgoing-invitation state retains received-code entry');
}
const claimed=ui.claimReferral();assert.equal(calls.at(-1).method,'POST');assert.equal(calls.at(-1).body.code,'FRIEND');
assert.equal(await ui.claimReferral(),false,'Duplicate submit blocked');
pending.shift().resolve({...payload,canClaim:false,attribution:{status:'pending'}});assert.equal(await claimed,true);
assert.match(ui.referralCard(),/초대 코드 등록 완료/);assert.doesNotMatch(ui.referralCard(),/referral-claim-form/);
assert.match(ui.referralCard({...ui.getReferrals(),data:{...payload,canClaim:false,attribution:{status:'unavailable'}}}),/초대 코드는 다시 등록할 수 없어요/);
assert.match(ui.referralCard({...ui.getReferrals(),data:{...payload,canClaim:false,attribution:null,claimUnavailableReason:'account_unavailable'}},{claim:true}),/현재 계정 상태에서는/);
let copied;context.navigator.clipboard={writeText:async value=>{copied=value;}};
assert.equal((await ui.shareReferral({copy:true})).kind,'copied');assert.equal(copied,payload.shareUrl);
context.navigator.clipboard={writeText:async()=>{throw Error('Denied');}};
await assert.rejects(ui.shareReferral({copy:true}),/Denied/);
delete context.navigator.clipboard;assert.equal((await ui.shareReferral({copy:true})).kind,'manual');
context.navigator.share=async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'});};assert.equal((await ui.shareReferral()).kind,'cancelled');
ui.setReferralDraft('ACCOUNT-A-DRAFT');const stale=ui.refreshReferrals({force:true});const old=pending.shift();
state={accountKey:'b',user:{id:'b'},access:'allowed'};subscriber(state);
assert.equal(ui.getReferrals().draft,'','Draft must clear on account change');assert.equal(ui.getReferrals().data,null);
old.resolve(payload);await stale;assert.equal(ui.getReferrals().data,null,'Late account A fetch cannot populate B');
pending.shift().resolve({...payload,code:'EGO-B'});await settle();
ui.setReferralDraft('B-CLAIM');const staleClaim=ui.claimReferral();const oldClaim=pending.shift();
state={accountKey:'signedOut',user:null,access:'signedOut'};subscriber(state);
oldClaim.resolve({...payload,attribution:{status:'pending'}});assert.equal(await staleClaim,false);assert.equal(ui.getReferrals().data,null,'Late claim must not cross logout');
state={accountKey:'c',user:{id:'c'},access:'allowed'};subscriber(state);pending.shift().reject(Error('Offline'));await settle();
assert.match(ui.referralCard(),/Offline/);assert.doesNotMatch(ui.referralCard(),/referral-code-input/,'Unavailable service cannot claim');
assert.match(ui.referralCard(),/다시 불러오기/);
// Execute actual route/nav/reward composition functions with rendering edges replaced.
const app=await readFile(new URL('app.js',base),'utf8');let markup='';let navLinks=[];
const nav={querySelector:()=>null,querySelectorAll:()=>navLinks,hidden:false};
const renderer=vm.createContext({URLSearchParams,titles:{home:'홈',ranking:'보상',missions:'촬영',guide:'가이드',activity:'활동',education:'교육',estimate:'계산',wallet:'보상',profile:'프로필'},location:{hash:''},nav,setMarkup:(_node,value)=>{markup=value;navLinks=[...value.matchAll(/data-tab="([^"]+)"/g)].map(match=>({dataset:{tab:match[1]},setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];}}));},icon:()=>'',rankingScreen:()=>'<rank/>',wallet:()=>'<wallet/>',getCommunity:()=>({}),button:()=>'',empty:()=>''});
for(const name of ['route','renderNav','rewards']){const start=app.indexOf('function '+name+'(');const next=app.indexOf('\nfunction ',start+1);vm.runInContext(app.slice(start,next),renderer);}
for(const hash of ['#missions','#activity/foo','#guide/foo/2','#education','#estimate']){renderer.location.hash=hash;vm.runInContext('renderNav(route())',renderer);assert.equal(navLinks.find(link=>link['aria-current']==='page').dataset.tab,'missions');}
assert.deepEqual(navLinks.map(link=>link.dataset.tab),['home','missions','wallet','profile']);assert.match(markup,/>촬영</);
renderer.location.hash='#ranking';vm.runInContext('renderNav(route())',renderer);assert.equal(navLinks.find(link=>link['aria-current']==='page').dataset.tab,'wallet');
for(const hash of ['#wallet','#ranking']){
 renderer.location.hash=hash;
 const combined=vm.runInContext('rewards({})',renderer);
 assert.match(combined,/<wallet\/>/,'Wallet composition renders points; ranking is its own route');
 assert.doesNotMatch(combined,/<rank\/>/);
 assert.doesNotMatch(combined,/reward-view|data-view|<button/,'No view-switch controls remain');
}
assert.match(app,/referral:'친구 초대 포인트'/);assert.match(app,/#ranking/);assert.match(app,/ranking:\(\)=>rankingScreen/);
console.log('EGO referral UI: explicit claim, sharing, stale account isolation, loading/error and reward/navigation passed');
