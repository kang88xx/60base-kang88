import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable,Writable} from 'node:stream';
import {createService} from '../server/app.mjs';
import {createHfMedia} from '../server/hf-media.mjs';
import {createHfState} from '../server/hf-state.mjs';
import {hashPassword} from '../server/security.mjs';
import {HfMemoryStorage} from './helpers/hf-memory-storage.mjs';

const origin='http://localhost';
const password='Testing-secure-Password-2026';
const consent={filming:true,privacy:true,usage:true,training:true,recordedInKorea:true};
const checks={framing:true,hands:true,privacy:true,completion:true};
const productionAuth=process.env.EGO_TEST_PRODUCTION_AUTH==='1';
// Mock only the external Firebase token verification boundary. Enrollment,
// auth identities, sessions, authorization and all downstream APIs remain real.
const firebaseIdentities=new Map(['member','stranger'].map(name=>[
 `fixture-firebase-${name}`,
 {uid:`fixture-uid-${name}`,email:`${name}@example.test`,name:'Review Member',registration:{provider:'google.com',displayName:'Review Member',terms:true,privacy:true,adult:true}}
]));
const authConfiguration=productionAuth?{
 allowRegistration:false,
 verifyFirebase:async idToken=>{
  const identity=firebaseIdentities.get(idToken);
  if(!identity)throw Object.assign(new Error('Unknown fixture Firebase token'),{status:401});
  return identity;
 }
}:{};

// Deliberately use the real request listener: no network sockets or fetch mocks.
async function request(service,route,{method='GET',headers={},body}={}){
 const req=Readable.from(body===undefined?[]:[Buffer.from(body)]);
 Object.assign(req,{url:'/api'+route,method,headers:Object.fromEntries(Object.entries(headers).map(([key,value])=>[key.toLowerCase(),value])),socket:{remoteAddress:'127.0.0.1'}});
 const chunks=[],responseHeaders={};
 const res=new Writable({write(chunk,_encoding,done){chunks.push(Buffer.from(chunk));done();}});
 res.setHeader=(name,value)=>responseHeaders[name.toLowerCase()]=value;
 res.getHeader=name=>responseHeaders[name.toLowerCase()];
 res.removeHeader=name=>delete responseHeaders[name.toLowerCase()];
 res.writeHead=(status,values={})=>{res.statusCode=status;res.headersSent=true;for(const [name,value] of Object.entries(values))res.setHeader(name,value);return res;};
 const finished=new Promise((resolve,reject)=>{res.once('finish',resolve);res.once('error',reject);});
 service.server.emit('request',req,res);
 await finished;
 const bytes=Buffer.concat(chunks);
 return {status:res.statusCode,headers:responseHeaders,bytes};
}

for(const mode of ['local','hf'])await test(`${mode}${productionAuth?' / production auth configuration':''}: real admin review and points integration`,async t=>{
 const temporary=await mkdtemp(path.join(os.tmpdir(),'ego-admin-review-'));
 const storage=mode==='hf'?new HfMemoryStorage():null;
 const encryptionKey=randomBytes(32).toString('base64');
 let service,directory,generation=0;
 async function start(allowInitialize=false){
  directory=path.join(temporary,'runtime-'+generation++);
  const persistence=storage?createHfState({storage,directory,encryptionKey,allowInitialize}):null;
  if(persistence)assert.equal(await persistence.restore(),!allowInitialize);
  const media=storage?createHfMedia({storage,checkpoint:store=>persistence.checkpoint(store),assertCurrent:()=>persistence.assertCurrent()}):null;
  service=createService({directory,origin,persistence,media,...authConfiguration});
  if(persistence)await persistence.checkpoint(service.store);
  await service.maintenance();
 }
 function client(){return {cookie:'',csrf:'',async response(route,{method='GET',body,raw,headers={}}={}){
  return request(service,route,{method,headers:{Origin:origin,Cookie:this.cookie,'X-CSRF-Token':this.csrf,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:raw??(body===undefined?undefined:JSON.stringify(body))});
 },async call(route,options={}){
  const response=await this.response(route,options);
  const text=response.bytes.toString();
  const payload=options.text?text:JSON.parse(text);
  assert.equal(response.status,options.status??200,`${options.method||'GET'} ${route}: ${text}`);
  if(response.headers['set-cookie'])this.cookie=response.headers['set-cookie'].split(';')[0];
  if(payload.csrf)this.csrf=payload.csrf;
  return payload;
 }};}
 const admin=client(),member=client(),stranger=client(),anonymous=client();
 let originalTask,primary,secondary,memberId;const completedUploads=new Map();
 const fixtures={};
 async function upload(owner,extension,title){
  const bytes=fixtures[extension],mime=extension==='mov'?'video/quicktime':'video/mp4';
  const session=await owner.call('/uploads',{method:'POST',status:201,body:{taskId:originalTask.id,title,filename:`fixture.${extension}`,mime,size:bytes.length,duration:1,width:64,height:48}});
  for(let offset=0;offset<bytes.length;offset+=session.chunkSize)await owner.call(`/uploads/${session.id}?offset=${offset}`,{method:'PUT',raw:bytes.subarray(offset,offset+session.chunkSize)});
  const saved=await owner.call(`/uploads/${session.id}/complete`,{method:'POST',body:{},status:201});completedUploads.set(saved.id,session.id);
  if(storage){assert.deepEqual(storage.bytes('videos/'+saved.id),bytes);assert.equal(storage.keys().some(key=>key.startsWith('staging/'+session.id+'/')),false);}
  return saved.id;
 }
 const details=id=>admin.call('/videos/'+id);
 const review=async(id,stage,revision,extra={})=>{const {body:changes={},...options}=extra;return admin.call(`/admin/videos/${id}/review`,{method:'POST',...options,body:{stage,revision,reviewVersion:(await details(id)).video.reviewVersion,decision:'approved',checks,...changes}});};
 async function assertPoints(amount,count){
  const me=await member.call('/me');
  assert.deepEqual(me.wallet,{balance:amount,available:amount,pending:0,paid:0,earned:amount});
  assert.equal(me.ledger.length,count);
  assert.equal(me.ledger.reduce((sum,row)=>sum+row.amount,0),amount);
  const data=await admin.call('/admin/data');
  assert.deepEqual(data.members.find(row=>row.id===memberId).wallet,me.wallet);
  const csv=await admin.call('/admin/export?type=members',{text:true});
  const row=csv.replaceAll('\ufeff','').split(/\r?\n/).find(row=>row.includes(memberId));
  assert.ok(row,'member must appear in the real members export');
  const columns=row.split(',').map(value=>value.replace(/^"|"$/g,''));
  assert.deepEqual(columns.slice(4,9).map(Number),[amount,amount,0,0,amount]);
  return me;
 }
 try{
  await start(true);
  for(const [extension,color] of [['mov','blue'],['mp4','red']]){
   const file=path.join(temporary,'fixture.'+extension);
   execFileSync(process.env.EGO_FFMPEG||'/opt/homebrew/bin/ffmpeg',['-v','error','-f','lavfi','-i',`color=c=${color}:s=64x48:r=10`,'-t','1','-c:v','libx264','-y',file]);
   fixtures[extension]=await readFile(file);
  }
  // Only bootstrap the privileged fixture directly; all member/review/ledger flows use APIs.
  const now=service.store.now();
  service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt,forcePassword) VALUES(?,?,?,?,?,?,?,?)','admin','admin@example.test',await hashPassword(password),'Review Admin','admin',now,now,0);
  await admin.call('/auth/login',{method:'POST',body:{email:'admin@example.test',password}});
  for(const [owner,email] of [[member,'member@example.test'],[stranger,'stranger@example.test']]){
   const registered=productionAuth
    ?await owner.call('/auth/firebase',{method:'POST',body:{idToken:`fixture-firebase-${email.split('@')[0]}`}})
    :await owner.call('/auth/register',{method:'POST',status:201,body:{email,password,name:'Review Member',terms:true,privacy:true,adult:true}});
   if(owner===member)memberId=registered.user.id;
  }
  originalTask=(await member.call('/catalog')).tasks.find(row=>row.id==='folding-clothes');
  assert.ok(originalTask);assert.ok(originalTask.reward>0);

  if(productionAuth)await t.test('production auth configuration blocks password registration and enrolls Google members',async()=>{
   await anonymous.call('/auth/register',{method:'POST',status:503,body:{email:'password-blocked@example.test',password,name:'Blocked Password Member',terms:true,privacy:true,adult:true}});
   assert.equal(service.store.one('SELECT id FROM users WHERE email=?','password-blocked@example.test'),undefined);
   const session=await member.call('/session');assert.equal(session.authProvider,'google');assert.equal(session.authMethod,'google');assert.equal(session.user.id,memberId);
   assert.equal(service.store.one('SELECT uid FROM auth_identities WHERE userId=?',memberId).uid,'fixture-uid-member');
  });

  await t.test('MOV submission appears in the admin queue with exact authenticated media and range',async()=>{
   primary=await upload(member,'mov','Original MOV submission');
   await member.call(`/videos/${primary}/submit`,{method:'POST',body:consent});
   const queued=(await admin.call('/admin/data')).videos.find(row=>row.id===primary);
   assert.equal(queued.status,'submitted');assert.equal(queued.reviewStage,'ai');assert.equal(queued.revision,1);
   assert.equal(queued.memberEmail,'member@example.test');assert.equal(queued.taskTitle,originalTask.title);
   const detail=await details(primary);assert.equal(detail.video.title,'Original MOV submission');assert.equal(detail.task.title,originalTask.title);assert.equal(detail.video.mime,'video/quicktime');
   const full=await admin.response(`/videos/${primary}/file`);assert.equal(full.status,200);assert.equal(full.headers['content-type'],'video/quicktime');assert.deepEqual(full.bytes,fixtures.mov);
   const range=await admin.response(`/videos/${primary}/file`,{headers:{Range:'bytes=8-63'}});assert.equal(range.status,206);assert.equal(range.headers['content-range'],`bytes 8-63/${fixtures.mov.length}`);assert.deepEqual(range.bytes,fixtures.mov.subarray(8,64));
   const overview=await admin.call('/admin/overview');assert.equal(overview.pendingReviews,1);
   await assertPoints(0,0);
  });

  await t.test('member and anonymous requests cannot review or read another owner’s media',async()=>{
   await member.call('/admin/data',{status:403});await anonymous.call('/admin/data',{status:401});
   await member.call(`/admin/videos/${primary}/review`,{method:'POST',status:403,body:{stage:'ai',revision:1,decision:'approved',checks}});
   for(const suffix of ['', '/file'])await stranger.call(`/videos/${primary}${suffix}`,{status:404});
   await stranger.call(`/videos/${primary}/submit`,{method:'POST',body:consent,status:404});
   await admin.call(`/videos/${primary}/submit`,{method:'POST',body:consent,status:403});
   await anonymous.call(`/videos/${primary}/file`,{status:401});
   assert.equal((await details(primary)).reviews.length,0);await assertPoints(0,0);
  });

  await t.test('task edits and retirement preserve the uploaded task title and reward snapshot',async()=>{
   await admin.call('/admin/tasks',{method:'POST',body:{...originalTask,title:'Changed task after submission',reward:originalTask.reward+777,published:false}});
   const detail=await details(primary);assert.equal(detail.video.reward,originalTask.reward);assert.equal(detail.task.title,originalTask.title);assert.equal(detail.task.instructions,originalTask.instructions);
   assert.equal((await admin.call('/admin/data')).videos.find(row=>row.id===primary).taskTitle,originalTask.title);
   assert.equal((await member.call('/catalog')).tasks.some(row=>row.id===originalTask.id),false);
   await admin.call('/admin/tasks',{method:'POST',body:{...originalTask,published:true}});
  });

  await t.test('stale revision, wrong stage and incomplete manual checks do not advance or award',async()=>{
   await review(primary,'ai',0,{status:409});await review(primary,'client',1,{status:409});
   const ai=await review(primary,'ai',1);assert.deepEqual(ai,{ok:true,stage:'manual',status:'reviewing',reviewVersion:2});await assertPoints(0,0);
   await review(primary,'ai',1,{status:409});
   await review(primary,'manual',1,{body:{stage:'manual',revision:1,decision:'approved',checks:{...checks,hands:false}},status:400});
   const detail=await details(primary);assert.equal(detail.video.reviewStage,'manual');assert.equal(detail.reviews.length,1);
   await assertPoints(0,0);
   await review(primary,'manual',1);assert.equal((await details(primary)).video.reviewStage,'client');await assertPoints(0,0);
  });

  await t.test('concurrent and repeated final approvals create exactly one original reward',async()=>{
   const payload={method:'POST',body:{stage:'client',revision:1,reviewVersion:(await details(primary)).video.reviewVersion,decision:'approved',checks}};
   const responses=await Promise.all([admin.response(`/admin/videos/${primary}/review`,payload),admin.response(`/admin/videos/${primary}/review`,payload)]);
   assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
   await review(primary,'client',1,{status:409});
   const detail=await details(primary);assert.equal(detail.video.status,'approved');assert.equal(detail.video.reviewStage,'complete');assert.equal(detail.reviews.length,3);
   assert.deepEqual(detail.reviews.map(row=>row.stage),['ai','manual','client']);
   const me=await assertPoints(originalTask.reward,1);assert.equal(me.ledger[0].reference,primary);assert.equal(me.ledger[0].kind,'reward');
   const exported=await admin.call('/admin/export?type=videos',{text:true});
   const exportedVideo=exported.split(/\r?\n/).find(row=>row.includes(primary)).split(',').map(value=>value.replace(/^"|"$/g,''));
   assert.deepEqual(exportedVideo.slice(0,5),[primary,memberId,'Original MOV submission','approved','complete']);
  });

  await t.test('MP4 rejection and resubmission require a new revision and award only after all stages',async()=>{
   secondary=await upload(member,'mp4','Resubmitted MP4');
   await member.call(`/videos/${secondary}/submit`,{method:'POST',body:consent});
   await review(secondary,'ai',1,{body:{stage:'ai',revision:1,decision:'rejected',reason:'Please correct the framing'}});
   let detail=await details(secondary);assert.equal(detail.video.status,'rejected');assert.equal(detail.video.reason,'Please correct the framing');
   await assertPoints(originalTask.reward,1);
   await member.call(`/videos/${secondary}/submit`,{method:'POST',body:{...consent,idempotencyKey:'intentional-resubmit-0001',expectedRevision:1}});
   detail=await details(secondary);assert.equal(detail.video.revision,2);assert.equal(detail.video.reviewStage,'ai');assert.equal(detail.video.reason,'');assert.deepEqual(detail.video.checks,{});
   await review(secondary,'ai',1,{status:409});
   for(const stage of ['ai','manual']){await review(secondary,stage,2);await assertPoints(originalTask.reward,1);}
   await review(secondary,'client',2);await review(secondary,'client',2,{status:409});
   const me=await assertPoints(originalTask.reward*2,2);assert.equal(me.ledger.filter(row=>row.reference===secondary).length,1);
   const range=await admin.response(`/videos/${secondary}/file`,{headers:{Range:'bytes=0-31'}});assert.equal(range.status,206);assert.equal(range.headers['content-type'],'video/mp4');assert.deepEqual(range.bytes,fixtures.mp4.subarray(0,32));
  });

  await t.test('points remain non-cash: bank linking, withdrawal, purchases and admin payout are blocked',async()=>{
   const settings=(await member.call('/session')).settings;
   for(const key of ['payoutsEnabled','bankLinkEnabled','redemptionEnabled','shopOpen'])assert.equal(settings[key],false);
   assert.equal(settings.rewardUnit,'points');
   for(const route of ['/payouts','/orders'])await member.call(route,{method:'POST',body:{amount:1,requestKey:'prevent-cash-regression'},status:409});
   await member.call('/account',{method:'PATCH',body:{bank:{name:'Test Bank',account:'0000'}},status:409});
   await admin.call('/admin/settings',{method:'PATCH',body:{shopOpen:true},status:409});
   await admin.call('/admin/payouts/nonexistent',{method:'PATCH',body:{status:'paid',reference:'fake'},status:409});
   const me=await assertPoints(originalTask.reward*2,2);assert.equal(me.payouts.length,0);assert.equal(me.orders.length,0);
  });

  await t.test('storage restart retains review decisions, exact rewards and readable media',async()=>{
   await service.close();service=null;
   if(storage)await start();
   else{service=createService({directory,origin,...authConfiguration});await service.maintenance();}
   const detail=await details(primary);assert.equal(detail.video.status,'approved');assert.equal(detail.reviews.length,3);
   if(productionAuth){const session=await member.call('/session');assert.equal(session.authProvider,'google');assert.equal(session.authMethod,'google');await anonymous.call('/auth/register',{method:'POST',status:503,body:{email:'restart-password-blocked@example.test',password,name:'Blocked After Restart',terms:true,privacy:true,adult:true}});}
   await assertPoints(originalTask.reward*2,2);
   const response=await admin.response(`/videos/${primary}/file`,{headers:{Range:'bytes=32-63'}});assert.equal(response.status,206);assert.deepEqual(response.bytes,fixtures.mov.subarray(32,64));
   if(storage)assert.ok(storage.bytes('system/checkpoint.bin'));
  });

  await t.test('approved media deletion needs admin confirmation and preserves earned points',async()=>{
   await member.call(`/videos/${primary}`,{method:'DELETE',status:409});
   await member.call(`/admin/videos/${primary}/remove`,{method:'POST',body:{confirm:primary,reason:'Member must not delete'},status:403});
   await admin.call(`/admin/videos/${primary}/remove`,{method:'POST',body:{confirm:secondary,reason:'Wrong target confirmation'},status:400});
   await admin.call(`/admin/videos/${primary}/remove`,{method:'POST',body:{confirm:primary,reason:'Approved media removal'}});
   await admin.call(`/videos/${primary}/file`,{status:404});await review(primary,'client',1,{status:404});
   await assertPoints(originalTask.reward*2,2);
   if(storage)assert.equal(storage.keys().includes('videos/'+primary),false);
  });

  await t.test('account deletion cannot erase a different owner and blocks safely without configured erasers',async()=>{
   await member.call('/account/deletion',{method:'POST',body:{confirm:'WRONG'},status:400});
   const requested=await member.call('/account/deletion',{method:'POST',body:{confirm:'DELETE',userId:'admin'},status:202});
   const job=requested.deletion;
   await stranger.call(`/admin/account-deletions/${job.id}/process`,{method:'POST',body:{confirm:job.id},status:403});
   await admin.call(`/admin/account-deletions/${job.id}/process`,{method:'POST',body:{confirm:'wrong'},status:400});
   const processed=await admin.call(`/admin/account-deletions/${job.id}/process`,{method:'POST',body:{confirm:job.id}});
   assert.equal(processed.deletion.status,'blocked');
   const queued=(await admin.call('/admin/account-deletions')).deletions.find(row=>row.id===job.id);assert.equal(queued.userId,memberId);assert.equal(queued.lastError,'ERASER_NOT_CONFIGURED');
   const receipt=await anonymous.call('/account/deletion/receipt',{method:'POST',body:{receiptToken:job.receiptToken}});assert.equal(receipt.deletion.status,'blocked');assert.equal('userId' in receipt.deletion,false);
   await assertPoints(originalTask.reward*2,2);assert.equal((await admin.call('/me')).user.role,'admin');
   const response=await admin.response(`/videos/${secondary}/file`);assert.equal(response.status,200);assert.deepEqual(response.bytes,fixtures.mp4);
  });

  // These are intentionally strict regression witnesses for product gaps, not TODO/skips.
  let witness;
  await t.test('REGRESSION: a committed submit replay returns its existing receipt instead of a false failure',async()=>{
   witness=await upload(stranger,'mp4','Retry and queue witness');
   await stranger.call(`/videos/${witness}/submit`,{method:'POST',body:consent});
   // A dropped response is indistinguishable to the client from an uncommitted request.
   const replay=await stranger.response(`/videos/${witness}/submit`,{method:'POST',body:consent});
   const committed=await details(witness);assert.equal(committed.video.status,'submitted');assert.equal(committed.video.revision,1);
   assert.equal(replay.status,200,`already committed submission reports ${replay.status}: ${replay.bytes}`);
   assert.equal(JSON.parse(replay.bytes).video.id,witness);
  });

  await t.test('REGRESSION: a second admin using a stale review revision cannot overwrite current review notes',async()=>{
   const secondAdmin=client();
   service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt,forcePassword) VALUES(?,?,?,?,?,?,?,?)','second-admin','second-admin@example.test',await hashPassword(password),'Second Review Admin','admin',service.store.now(),service.store.now(),0);
   await secondAdmin.call('/auth/login',{method:'POST',body:{email:'second-admin@example.test',password}});
   await review(witness,'ai',1);
   const staleVersion=(await details(witness)).video.reviewVersion;
   await review(witness,'manual',1,{body:{stage:'manual',revision:1,decision:'reviewing',reason:'First reviewer findings',checks:{framing:true}}});
   const stale=await secondAdmin.response(`/admin/videos/${witness}/review`,{method:'POST',body:{stage:'manual',revision:1,reviewVersion:staleVersion,decision:'reviewing',reason:'Stale reviewer overwrite',checks:{privacy:true}}});
   const current=await details(witness);
   assert.equal(stale.status,409,`stale write reports ${stale.status}; persisted reason=${current.video.reason}; checks=${JSON.stringify(current.video.checks)}`);
   assert.equal(current.video.reason,'First reviewer findings');assert.deepEqual(current.video.checks,{framing:true});
  });

  await t.test('durable receipts survive response loss/restart and rejection without creating a new attempt',async()=>{
   const key='durable-submit-retry-0001',requestBody={...consent,idempotencyKey:key,expectedRevision:0};
   // Adopt the already submitted legacy attempt; the same explicit request may safely recover it.
   const first=await stranger.call(`/videos/${witness}/submit`,{method:'POST',body:requestBody});assert.equal(first.receipt.revision,1);
   await stranger.call(`/videos/${witness}/submit`,{method:'POST',body:{...requestBody,usage:false},status:400});
   await stranger.call(`/videos/${witness}/submit`,{method:'POST',body:{...requestBody,expectedRevision:1},status:409});
   await member.call(`/videos/${witness}/submit`,{method:'POST',body:requestBody,status:404});
   const savedConsent=service.store.one('SELECT consent FROM videos WHERE id=?',witness).consent;service.store.run('UPDATE videos SET consent=? WHERE id=?',JSON.stringify({...JSON.parse(savedConsent),version:'different-consent-policy'}),witness);await stranger.call(`/videos/${witness}/submit`,{method:'POST',body:{...requestBody,idempotencyKey:'changed-consent-0002'},status:409});service.store.run('UPDATE videos SET consent=? WHERE id=?',savedConsent,witness);
   const up=completedUploads.get(witness),completion=await stranger.call(`/uploads/${up}/complete`,{method:'POST',body:{}});assert.equal(completion.id,witness);assert.equal(completion.replayed,true);
   await member.call(`/uploads/${up}/complete`,{method:'POST',body:{},status:404});
   const revision=(await details(witness)).video.revision;await review(witness,'manual',revision,{body:{decision:'rejected',reason:'Intentional rejection'}});
   await service.close();service=null;if(storage)await start();else{service=createService({directory,origin,...authConfiguration});await service.maintenance();}
   const replay=await stranger.call(`/videos/${witness}/submit`,{method:'POST',body:requestBody});assert.deepEqual(replay.receipt,first.receipt);assert.equal(replay.video.status,'rejected');assert.equal(replay.video.revision,1);
   await stranger.call(`/videos/${witness}/submit`,{method:'POST',body:consent,status:409});
   const again=await stranger.call(`/uploads/${up}/complete`,{method:'POST',body:{}});assert.equal(again.video.status,'rejected');assert.equal(again.id,witness);
   const bytes=fixtures.mp4,duplicateUpload=await stranger.call('/uploads',{method:'POST',status:201,body:{taskId:originalTask.id,title:'Duplicate rejected witness',filename:'same.mp4',mime:'video/mp4',size:bytes.length,duration:1,width:64,height:48}});
   await stranger.call(`/uploads/${duplicateUpload.id}?offset=0`,{method:'PUT',raw:bytes});const duplicate=await stranger.call(`/uploads/${duplicateUpload.id}/complete`,{method:'POST',body:{}});assert.equal(duplicate.duplicate,true);assert.equal(duplicate.id,witness);assert.equal(duplicate.video.status,'rejected');assert.equal((await stranger.call(`/uploads/${duplicateUpload.id}/complete`,{method:'POST',body:{}})).id,witness);
   const next=await stranger.call(`/videos/${witness}/submit`,{method:'POST',body:{...consent,idempotencyKey:'intentional-new-attempt-0002',expectedRevision:1}});assert.equal(next.video.revision,2);assert.equal(next.video.status,'submitted');
   const oldAgain=await stranger.call(`/videos/${witness}/submit`,{method:'POST',body:requestBody});assert.equal(oldAgain.receipt.revision,1);assert.equal(oldAgain.video.revision,2);
   const reviewsBefore=(await details(witness)).reviews.length;await admin.call(`/admin/videos/${witness}/review`,{method:'POST',body:{stage:'ai',revision:2,decision:'reviewing',checks},status:409});assert.equal((await details(witness)).reviews.length,reviewsBefore);
  });

  await t.test('legacy-only rejected videos remain resubmittable beside the same owners keyed video',async()=>{
   const legacy=await upload(stranger,'mov','Legacy unkeyed resubmission');
   const first=await stranger.call(`/videos/${legacy}/submit`,{method:'POST',body:consent});
   assert.equal(first.receipt.revision,1);
   await review(legacy,'ai',1,{body:{decision:'rejected',reason:'Legacy framing correction'}});
   const before=await stranger.call('/me');assert.equal(before.ledger.length,0);
   const next=await stranger.call(`/videos/${legacy}/submit`,{method:'POST',body:consent});
   assert.equal(next.video.revision,2);assert.equal(next.video.status,'submitted');assert.equal(next.video.reviewStage,'ai');assert.equal(next.video.reason,'');assert.deepEqual(next.video.checks,{});
   const replay=await stranger.call(`/videos/${legacy}/submit`,{method:'POST',body:consent});
   assert.equal(replay.replayed,true);assert.equal(replay.video.revision,2);
   await review(legacy,'ai',1,{status:409});
   for(const stage of ['ai','manual']){await review(legacy,stage,2);assert.equal((await stranger.call('/me')).ledger.length,0);}
   await review(legacy,'client',2);await review(legacy,'client',2,{status:409});
   const credited=await stranger.call('/me');assert.equal(credited.ledger.length,1);assert.equal(credited.ledger[0].reference,legacy);assert.equal(credited.wallet.earned,originalTask.reward);
   // The other video belongs to this same owner and has durable keys; legacy compatibility must not weaken its fence.
   await review(witness,'ai',2,{body:{decision:'rejected',reason:'Keyed fence after legacy retry'}});
   await stranger.call(`/videos/${witness}/submit`,{method:'POST',body:consent,status:409});
   const restored=await stranger.call(`/videos/${witness}/submit`,{method:'POST',body:{...consent,idempotencyKey:'intentional-after-legacy-0003',expectedRevision:2}});
   assert.equal(restored.video.revision,3);assert.equal(restored.video.status,'submitted');
  });

  await t.test('REGRESSION: pending queue remains discoverable behind 1000 newer completed uploads',async()=>{
   // Seed only the scale boundary; the pending witness was uploaded/submitted/reviewed through real APIs.
   // No media bytes or ledger records are needed for completed list-only fixture rows.
   service.store.transaction(()=>{
    for(let index=0;index<1000;index++)service.store.run(`INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,captureTask,path,sha,status,reviewStage,revision,createdAt,submittedAt,reviewedAt,reason,checks,consent)
     SELECT ?,userId,taskId,title,filename,mime,size,duration,width,height,reward,captureTask,path,?,'approved','complete',revision,?,submittedAt,reviewedAt,'','{}',consent FROM videos WHERE id=?`,
     'queue-scale-'+index,'queue-scale-hash-'+index,new Date(Date.now()+60000+index).toISOString(),witness);
   });
   const data=await admin.call('/admin/data');
   const overview=await admin.call('/admin/overview');assert.equal(overview.pendingReviews,1);
   const pending=await admin.call('/admin/videos');assert.equal(pending.total,1);assert.equal(pending.counts.pending,1);assert.equal(pending.videos[0].id,witness);
   await member.call('/admin/videos',{status:403});await admin.call('/admin/videos?limit=101',{status:400});await admin.call('/admin/videos?cursor=invalid',{status:400});
   const firstPage=await admin.call('/admin/videos?status=all&limit=100');assert.equal(firstPage.videos.length,100);assert.ok(firstPage.nextCursor);const nextPage=await admin.call('/admin/videos?status=all&limit=100&cursor='+encodeURIComponent(firstPage.nextCursor));assert.equal(nextPage.total,firstPage.total);assert.equal(new Set([...firstPage.videos,...nextPage.videos].map(v=>v.id)).size,200);await admin.call('/admin/videos?status=pending&cursor='+encodeURIComponent(firstPage.nextCursor),{status:400});
   const searched=await admin.call('/admin/videos?status=all&q=Retry%20and%20queue');assert.equal(searched.total,1001);assert.equal((await admin.call('/admin/videos?status=pending&stage=ai')).total,1);
   const capturedTask=JSON.parse(service.store.one('SELECT captureTask FROM videos WHERE id=?',witness).captureTask);
   service.store.run('UPDATE videos SET captureTask=? WHERE id=?',JSON.stringify({...capturedTask,title:'Captured task search witness'}),witness);
   const byTask=await admin.call('/admin/videos?status=all&q=Captured%20task%20search');assert.equal(byTask.total,1);assert.equal(byTask.videos[0].id,witness,'Admin search must include the displayed capture-time task title');
   service.store.run("UPDATE videos SET captureTask='{}' WHERE id=?",witness);
   service.store.run('UPDATE tasks SET title=? WHERE id=?','Legacy task search witness',originalTask.id);
   const legacyTask=await admin.call('/admin/videos?status=all&q=Legacy%20task%20search');assert.equal(legacyTask.total,1);assert.equal(legacyTask.videos[0].id,witness,'Legacy records must search the same fallback task title shown in the list');
   service.store.run('UPDATE videos SET captureTask=? WHERE id=?',JSON.stringify(capturedTask),witness);
   assert.ok(data.videos.some(row=>row.id===witness),`pending review ${witness} missing from ${data.videos.length} returned rows; overview.pendingReviews=${overview.pendingReviews}`);
  });
  await t.test('all pending pages remain reachable with tied timestamps and no duplicates',async()=>{
   service.store.run("UPDATE videos SET status='submitted',reviewStage='ai',createdAt='2026-10-14T00:00:00.000Z' WHERE id LIKE 'queue-scale-%'");
   let cursor=null;const ids=[];do{const page=await admin.call('/admin/videos?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(page.total,1001);assert.equal(page.counts.pending,1001);ids.push(...page.videos.map(v=>v.id));cursor=page.nextCursor;}while(cursor);
   assert.equal(ids.length,1001);assert.equal(new Set(ids).size,1001);assert.ok(ids.includes(witness));
  });
 }finally{await service?.close();await rm(temporary,{recursive:true,force:true});}
});
