import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable,Writable} from 'node:stream';
import {createService} from '../server/app.mjs';
import {createHfState} from '../server/hf-state.mjs';
import {createHfMedia} from '../server/hf-media.mjs';
import {HfMemoryStorage} from './helpers/hf-memory-storage.mjs';
import {digest} from '../server/security.mjs';
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

for(const mode of ['local','hf'])await test(mode+': referral handlers and SQLite transactions',async t=>{
 const temporary=await mkdtemp(path.join(os.tmpdir(),'ego-referrals-'));
 const origin='http://localhost',storage=mode==='hf'?new HfMemoryStorage():null,encryptionKey=randomBytes(32).toString('base64');
 let service,directory,generation=0;
 async function start(initialize=false){
  directory=storage?path.join(temporary,'runtime-'+generation++):temporary;
  const persistence=storage?createHfState({storage,directory,encryptionKey,allowInitialize:initialize}):null;
  if(persistence)await persistence.restore();
  service=createService({directory,origin,persistence,media:storage?createHfMedia({storage,checkpoint:s=>persistence.checkpoint(s),assertCurrent:()=>persistence.assertCurrent()}):null,identityEraser:{preflight:async()=>{},erase:async()=>({complete:true})},copiesEraser:async()=>({erased:true})});if(persistence)await persistence.checkpoint(service.store);await service.maintenance();
 }
 function client(userId,role='member'){
  if(!service.store.one('SELECT id FROM users WHERE id=?',userId))service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',userId,userId+'@test.invalid','unused',userId,role,service.store.now(),service.store.now());
  const headers={Origin:origin,Cookie:'dongjakso_session=session-'+userId,'X-CSRF-Token':'csrf-'+userId};
  service.store.run('INSERT OR REPLACE INTO sessions VALUES(?,?,?,?,?)',digest('session-'+userId),userId,'csrf-'+userId,Date.now()+86400000,Date.now());
  const response=(route,options={})=>request(service,route,{method:options.method||'GET',headers:{...headers,...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});
  const call=async(route,options={})=>{const res=await response(route,options);assert.equal(res.status,options.status??200,route+': '+res.bytes);return JSON.parse(res.bytes);};call.response=response;return call;
 }
 const video=(userId,vid,reward=1000)=>service.store.run(`INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,path,sha,status,reviewStage,revision,createdAt) VALUES(?,?,'dishwashing','Fixture','fixture.mp4','video/mp4',64,300,640,480,?,?,?,'submitted','ai',1,?)`,vid,userId,reward,vid,'sha-'+vid,service.store.now());
 const checks={framing:true,hands:true,privacy:true,completion:true};
 let admin,inviter,invitee,other,code,otherCode;
 const reviewBody=(vid,stage)=>{const row=service.store.one('SELECT * FROM videos WHERE id=?',vid);return {stage,revision:row.revision,reviewVersion:row.reviewVersion,decision:'approved',checks};};
 const review=(vid,stage)=>admin('/admin/videos/'+vid+'/review',{method:'POST',body:reviewBody(vid,stage)});
 try{
  await start(true);admin=client('admin','admin');inviter=client('inviter');invitee=client('invitee');other=client('other');
  code=(await inviter('/referrals')).code;otherCode=(await other('/referrals')).code;
  await t.test('authenticated private snapshots, unique codes, CSRF and invalid claims',async()=>{
   assert.notEqual(code,otherCode);assert.match(code,/^[A-F0-9]{18}$/);const snap=await inviter('/referrals');assert.equal(snap.shareUrl,origin+'/app/?ref='+code+'#profile');assert.equal(snap.canClaim,true);assert.equal(snap.attribution,null);
   assert.equal((await request(service,'/referrals')).status,401);
   await inviter('/referrals/claim',{method:'POST',body:{code:otherCode},headers:{'X-CSRF-Token':'wrong'},status:403});
   await inviter('/referrals/claim',{method:'POST',body:{code},status:400});
   for(const value of ['',null,'unknown'])await invitee('/referrals/claim',{method:'POST',body:{code:value},status:400});
   service.store.run("UPDATE users SET status='suspended' WHERE id='other'");await invitee('/referrals/claim',{method:'POST',body:{code:otherCode},status:400});service.store.run("UPDATE users SET status='active' WHERE id='other'");
  });
  await t.test('concurrent repeated claims are immutable and ignore spoofed account IDs',async()=>{
   const results=await Promise.all([invitee('/referrals/claim',{method:'POST',body:{code:code.toLowerCase(),userId:'other'}}),invitee('/referrals/claim',{method:'POST',body:{code}})]);
   assert.equal(results[0].attribution.status,'pending');assert.equal(results[1].canClaim,false);assert.equal(service.store.one('SELECT COUNT(*) n FROM referrals').n,1);assert.equal((await other('/referrals')).attribution,null);
   await invitee('/referrals/claim',{method:'POST',body:{code:otherCode},status:409});
  });
  await t.test('final approval awards exactly once across concurrency and subsequent videos',async()=>{
   video('invitee','first');video('invitee','second');await review('first','ai');await review('first','manual');assert.equal((await inviter('/me')).wallet.earned,0);
   // A referral ledger failure must roll back both credits and the final review.
   service.store.db.exec("CREATE TRIGGER referral_failure BEFORE INSERT ON ledger WHEN NEW.kind='referral' BEGIN SELECT RAISE(ABORT,'fixture referral write failure'); END");
   await admin('/admin/videos/first/review',{method:'POST',body:reviewBody('first','client'),status:500});
   assert.equal(service.store.one("SELECT reviewStage FROM videos WHERE id='first'").reviewStage,'client');assert.equal((await invitee('/me')).ledger.length,0);assert.equal((await inviter('/me')).ledger.length,0);
   service.store.db.exec('DROP TRIGGER referral_failure');
   const options={method:'POST',body:reviewBody('first','client')},responses=await Promise.all([admin.response('/admin/videos/first/review',options),admin.response('/admin/videos/first/review',options)]);assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);
   for(const stage of ['ai','manual','client'])await review('second',stage);
   const own=await inviter('/me');assert.equal(own.wallet.earned,1000);assert.equal(own.ledger.length,1);assert.equal(own.ledger[0].kind,'referral');assert.equal(own.ledger[0].reference.includes('invitee'),false);
   assert.deepEqual((await invitee('/referrals')).attribution,{status:'rewarded'});await invitee('/referrals/claim',{method:'POST',body:{code}});
   const snap=await inviter('/referrals');assert.equal(snap.invitedCount,1);assert.equal(snap.rewardedCount,1);assert.equal(snap.earnedPoints,1000);
   assert.equal((await inviter('/community/summary')).me.points,0);assert.equal((await admin('/admin/data')).members.find(x=>x.id==='inviter').wallet.earned,1000);
  });
  await t.test('inactive inviter at first approval cannot earn a delayed second-video reward',async()=>{
   const blocked=client('blocked'),friend=client('friend'),blockedCode=(await blocked('/referrals')).code;
   await friend('/referrals/claim',{method:'POST',body:{code:blockedCode}});service.store.run("UPDATE users SET status='suspended' WHERE id='blocked'");
   video('friend','blocked-first');for(const stage of ['ai','manual','client'])await review('blocked-first',stage);
   service.store.run("UPDATE users SET status='active' WHERE id='blocked'");video('friend','blocked-second');for(const stage of ['ai','manual','client'])await review('blocked-second',stage);assert.equal((await blocked('/me')).wallet.earned,0);
  });
  await t.test('historical video credits survive policy and removed media blocks late claim',async()=>{
   video('other','previous',3000);for(const stage of ['ai','manual','client'])await review('previous',stage);service.store.run("UPDATE videos SET status='deleted' WHERE id='previous'");
   assert.equal((await other('/referrals')).claimUnavailableReason,'first_video_approved');await other('/referrals/claim',{method:'POST',body:{code},status:409});assert.equal((await other('/me')).wallet.earned,3000);
   assert.ok((await other('/catalog')).tasks.every(x=>x.reward===1000));
   await admin('/admin/tasks',{method:'POST',body:{title:'Custom task',category:'Test',instructions:'Instructions',reward:9999,published:true}});assert.ok((await other('/catalog')).tasks.every(x=>x.reward===1000));
   service.store.run('UPDATE tasks SET reward=4444');service.store.run('INSERT INTO uploads VALUES(?,?,?,?,?,?)','legacy','other',JSON.stringify({taskId:'dishwashing',reward:3000,captureTask:{reward:3000}}),64,0,service.store.now());
   await inviter('/referrals');if(!storage)await writeFile(path.join(directory,'uploads','legacy'),Buffer.alloc(0));await service.close();await start();assert.equal((await inviter('/referrals')).code,code);assert.equal((await inviter('/me')).wallet.earned,1000);assert.equal(JSON.parse(service.store.one("SELECT metadata FROM uploads WHERE id='legacy'").metadata).reward,3000);
   const upload=await other('/uploads',{method:'POST',status:201,body:{taskId:'dishwashing',title:'New policy',filename:'new.mp4',mime:'video/mp4',size:64,duration:60,width:640,height:480}}),metadata=JSON.parse(service.store.one('SELECT metadata FROM uploads WHERE id=?',upload.id).metadata);assert.equal(metadata.reward,1000);assert.equal(metadata.captureTask.reward,1000);
   video('invitee','third');for(const stage of ['ai','manual','client'])await review('third',stage);assert.equal((await inviter('/me')).wallet.earned,1000);
  });
  await t.test('erasing an inviter keeps an anonymous permanent claim fence for surviving invitees',async()=>{
   const erased=client('erased-inviter'),survivor=client('surviving-invitee'),erasedCode=(await erased('/referrals')).code;
   await survivor('/referrals/claim',{method:'POST',body:{code:erasedCode}});
   const job=(await erased('/account/deletion',{method:'POST',body:{confirm:'DELETE'},status:202})).deletion;
   assert.equal((await admin('/admin/account-deletions/'+job.id+'/process',{method:'POST',body:{confirm:job.id}})).deletion.status,'completed');
   const snapshot=await survivor('/referrals');assert.equal(snapshot.canClaim,false);assert.equal(snapshot.claimUnavailableReason,'already_claimed');assert.deepEqual(snapshot.attribution,{status:'unavailable'});
   await survivor('/referrals/claim',{method:'POST',body:{code},status:409});
   const privacy=JSON.stringify({relations:service.store.all('SELECT * FROM referrals'),codes:service.store.all('SELECT * FROM referral_codes'),fences:service.store.all('SELECT * FROM referral_claim_tombstones')});
   assert.equal(privacy.includes('erased-inviter'),false);assert.equal(privacy.includes(erasedCode),false);assert.deepEqual({...service.store.one('SELECT * FROM referral_claim_tombstones WHERE inviteeId=?','surviving-invitee')},{inviteeId:'surviving-invitee'});
   await service.close();await start();assert.deepEqual((await survivor('/referrals')).attribution,{status:'unavailable'});await survivor('/referrals/claim',{method:'POST',body:{code:otherCode},status:409});
   video('surviving-invitee','orphan-first');for(const stage of ['ai','manual','client'])await review('orphan-first',stage);assert.equal((await inviter('/referrals')).earnedPoints,1000);
   const survivorJob=(await survivor('/account/deletion',{method:'POST',body:{confirm:'DELETE'},status:202})).deletion;
   assert.equal((await admin('/admin/account-deletions/'+survivorJob.id+'/process',{method:'POST',body:{confirm:survivorJob.id}})).deletion.status,'completed');assert.equal(service.store.one('SELECT COUNT(*) n FROM referral_claim_tombstones WHERE inviteeId=?','surviving-invitee').n,0);
  });
  await t.test('deletion blocks claims and removes relationships while preserving inviter credits',async()=>{
   const candidate=client('candidate'),inviteeCode=(await invitee('/referrals')).code,job=(await invitee('/account/deletion',{method:'POST',body:{confirm:'DELETE'},status:202})).deletion;
   await candidate('/referrals/claim',{method:'POST',body:{code:inviteeCode},status:400});await invitee('/referrals/claim',{method:'POST',body:{code},status:409});
   const result=await admin('/admin/account-deletions/'+job.id+'/process',{method:'POST',body:{confirm:job.id}});assert.equal(result.deletion.status,'completed');
   assert.equal(service.store.one("SELECT COUNT(*) n FROM referrals WHERE inviterId='invitee' OR inviteeId='invitee'").n,0);assert.equal(service.store.one("SELECT COUNT(*) n FROM referral_codes WHERE userId='invitee'").n,0);
   const credited=await inviter('/me');assert.equal(credited.wallet.earned,1000);assert.equal(JSON.stringify(credited.ledger).includes('invitee'),false);await candidate('/referrals/claim',{method:'POST',body:{code:inviteeCode},status:400});
  });
 }finally{await service?.close();await rm(temporary,{recursive:true,force:true});}
});
