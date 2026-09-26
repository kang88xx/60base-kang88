import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,stat,rename,mkdir,readdir} from 'node:fs/promises';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createService} from '../server/app.mjs';
import {processDeletions} from '../server/media.mjs';
import {hashPassword,csv} from '../server/security.mjs';
const directory=await mkdtemp(path.join(os.tmpdir(),'dongjakso-test-'));
let service;const checks=[];let base;
async function start(){service=createService({directory,origin:'http://localhost:4391'});await new Promise(r=>service.server.listen(4391,'127.0.0.1',r));base='http://localhost:4391';}
function client(){return {cookie:'',csrf:'',async call(route,{method='GET',body,raw,headers={},status=200}={}){const r=await fetch(base+'/api'+route,{method,headers:{Origin:base,Cookie:this.cookie,'X-CSRF-Token':this.csrf,...(body?{'Content-Type':'application/json'}:{}),...headers},body:raw|| (body?JSON.stringify(body):undefined)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}assert.equal(r.status,status,`${method} ${route}: ${text.slice(0,220)}`);if(r.headers.get('set-cookie'))this.cookie=r.headers.get('set-cookie').split(';')[0];if(data.csrf)this.csrf=data.csrf;return data;}};}
const consent={filming:true,privacy:true,usage:true,training:true,recordedInKorea:true};const checksOk={framing:true,hands:true,privacy:true,completion:true};
try{
 await start();const admin=client(),a=client(),b=client(),anon=client();
 const pw='Testing-secure-Password-2026',at=service.store.now();service.store.run("INSERT INTO users(id,email,password,name,role,createdAt,updatedAt,forcePassword) VALUES(?,?,?,?,?,?,?,?)",'admin','admin@example.test',await hashPassword(pw),'QA 관리자','admin',at,at,1);
 await admin.call('/auth/login',{method:'POST',body:{email:'admin@example.test',password:pw}});await admin.call('/admin/data',{status:403});await admin.call('/account',{method:'PATCH',body:{newPassword:pw+'!',currentPassword:pw}});await admin.call('/admin/data');
 for(const [c,mail,name] of [[a,'a@example.test','참여자 A'],[b,'b@example.test','=HYPERLINK("https://invalid.test")']])await c.call('/auth/register',{method:'POST',status:201,body:{email:mail,password:pw,name,terms:true,privacy:true,adult:true}});
 await anon.call('/admin/data',{status:401});await a.call('/admin/data',{status:403});await a.call('/account',{method:'PATCH',body:{name:'changed'},headers:{Origin:'https://evil.test'},status:403});await a.call('/account',{method:'PATCH',body:{name:'changed'},headers:{'X-CSRF-Token':'invalid'},status:403});
 for(const file of ['/server/database.mjs','/.env','/server/index.mjs','/admin-access.txt','/assets/missing.mp4'])assert.equal((await fetch(base+file)).status,404,file);
 checks.push('sessions, forced password change, member/admin separation, Origin/CSRF, private files');
 const buffer=await readFile(new URL('../assets/videos/collection/folding-clothes.mp4',import.meta.url));
 async function upload(c,buf=buffer){const up=await c.call('/uploads',{method:'POST',status:201,body:{taskId:'folding-clothes',title:'실제 영상',filename:'test.mp4',size:buf.length,mime:'video/mp4',duration:999,width:99,height:99}});await b.call('/uploads/'+up.id,{status:404});await c.call('/uploads/'+up.id+'?offset=2',{method:'PUT',raw:buf.subarray(0,10),status:409});for(let offset=0;offset<buf.length;offset+=up.chunkSize)await c.call(`/uploads/${up.id}?offset=${offset}`,{method:'PUT',raw:buf.subarray(offset,offset+up.chunkSize)});return c.call('/uploads/'+up.id+'/complete',{method:'POST',body:{},status:201});}
 const v=await upload(a);let details=await a.call('/videos/'+v.id);assert.ok(details.video.width>99);assert.ok(details.video.duration<999);assert.equal(details.video.path,undefined);assert.equal(details.video.sha,undefined);
 await b.call('/videos/'+v.id,{status:404});await anon.call('/videos/'+v.id+'/file',{status:401});const range=await fetch(base+'/api/videos/'+v.id+'/file',{headers:{Cookie:a.cookie,Range:'bytes=0-63'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,64);
 await a.call('/videos/'+v.id+'/submit',{method:'POST',body:{},status:400});await a.call('/videos/'+v.id+'/submit',{method:'POST',body:consent});await a.call('/videos/'+v.id+'/submit',{method:'POST',body:consent,status:409});
 await admin.call('/admin/tasks',{method:'POST',body:{id:'folding-clothes',title:'빨래 개기',category:'세탁',instructions:'촬영 기준',reward:9000,published:true}});
 await admin.call(`/admin/videos/${v.id}/review`,{method:'POST',body:{decision:'approved',revision:1,checks:checksOk},status:400});
 await admin.call(`/admin/videos/${v.id}/review`,{method:'POST',body:{stage:'ai',decision:'approved',revision:0,checks:checksOk},status:409});
 await admin.call(`/admin/videos/${v.id}/review`,{method:'POST',body:{stage:'manual',decision:'approved',revision:1,checks:{}},status:409});
 await admin.call(`/admin/videos/${v.id}/review`,{method:'POST',body:{stage:'ai',decision:'approved',revision:1,reason:'AI 예비 통과',checks:{}}});
 await admin.call(`/admin/videos/${v.id}/review`,{method:'POST',body:{stage:'manual',decision:'approved',revision:1,reason:'수동 검수 기준 누락',checks:{framing:true}},status:400});
 assert.equal(service.store.one('SELECT status FROM videos WHERE id=?',v.id).status,'reviewing','AI approval keeps submitted/reviewing workflow open');
 assert.equal((await a.call('/me')).wallet.earned,0,'AI approval creates no ledger');
 await admin.call(`/admin/videos/${v.id}/review`,{method:'POST',body:{stage:'manual',decision:'approved',revision:1,reason:'수동 검수 통과',checks:checksOk}});
 assert.equal(service.store.one('SELECT status FROM videos WHERE id=?',v.id).status,'reviewing','manual approval keeps client confirmation open');
 assert.equal((await a.call('/me')).wallet.earned,0,'manual approval creates no ledger');
 await admin.call(`/admin/videos/${v.id}/review`,{method:'POST',body:{stage:'client',decision:'approved',revision:1,reason:'최종 승인',checks:checksOk}});
 assert.equal(service.store.one('SELECT status FROM videos WHERE id=?',v.id).status,'approved','client approval is final');
 await admin.call(`/admin/videos/${v.id}/review`,{method:'POST',body:{stage:'client',decision:'approved',revision:1,reason:'중복 승인',checks:checksOk},status:409});
 assert.equal((await a.call('/me')).wallet.earned,3000,'final client approval credits reward snapshot once only');assert.notEqual((await a.call('/videos/'+v.id)).task.instructions,'촬영 기준','capture instructions snapshot');
 await admin.call(`/admin/videos/${v.id}/annotation`,{method:'POST',body:{start:0,end:10000,label:'bad'},status:400});await admin.call(`/admin/videos/${v.id}/annotation`,{method:'POST',body:{start:0,end:2,label:'접기',note:'손동작'},status:201});assert.equal((await a.call('/videos/'+v.id)).annotations.length,1);
 checks.push('private real video, validated metadata, chunk ordering, consent, staged AI/manual/client review contract, immutable reward snapshot, one-time final ledger, annotation bounds');
 await a.call('/payouts',{method:'POST',body:{amount:3000,requestKey:'withdraw-request-01'},status:409});await a.call('/account',{method:'PATCH',body:{bank:{bank:'테스트은행',holder:'QA',number:'123456789012'}},status:409});
 await admin.call('/admin/settings',{method:'PATCH',body:{shopOpen:true},status:409});await a.call('/orders',{method:'POST',body:{method:'reward',items:[],requestKey:'order-request-0001'},status:409});assert.equal((await a.call('/me')).wallet.available,3000);
 checks.push('points-only bank, payout, shop and redemption guards');
 const entryBody={kind:'income',category:'데이터 판매',amount:10000,party:'테스트',reference:'TEST-0001',date:'2026-09-14',requestKey:'entry-unique-0001'};await admin.call('/admin/entries',{method:'POST',body:entryBody,status:201});await admin.call('/admin/entries',{method:'POST',body:entryBody,status:201});assert.equal(service.store.one('SELECT COUNT(*) n FROM entries').n,1);await admin.call('/admin/entries',{method:'POST',body:{...entryBody,amount:3000},status:409});assert.equal((await admin.call('/admin/overview')).income,10000);assert.match(await admin.call('/admin/export?type=members'),/"'=HYPERLINK/);assert.ok(csv([['=1','+1','@bad']]).includes("'=1"));
 checks.push('KRW company bookkeeping remains idempotent, CSV formula neutralization');
 const backupRoot=path.join(directory,'backup-qa');const backup=spawnSync(process.execPath,['scripts/backup-service.mjs'],{env:{...process.env,DONGJAKSO_DATA_DIR:directory,DONGJAKSO_BACKUP_DIR:backupRoot},encoding:'utf8'});assert.equal(backup.status,0,backup.stderr);const backupPath=path.join(backupRoot,(await readdir(backupRoot))[0]);assert.deepEqual(await readFile(path.join(backupPath,'videos',v.id)),buffer);assert.deepEqual(await readFile(path.join(backupPath,'encryption.key')),await readFile(path.join(directory,'encryption.key')));checks.push('consistent SQLite backup, encryption key and exact original video copy');
 const ticket=await a.call('/tickets',{method:'POST',body:{subject:'영상 삭제',message:'원본 삭제 요청'},status:201});await admin.call('/admin/tickets/'+ticket.id,{method:'PATCH',body:{response:'확인했습니다.',status:'replied'}});assert.equal((await a.call('/me')).tickets[0].response,'확인했습니다.');const original=path.join(directory,'videos',v.id);await rename(original,original+'.hold');await mkdir(original);await writeFile(path.join(original,'lock'),'test');const removed=await admin.call('/admin/videos/'+v.id+'/remove',{method:'POST',body:{reason:'요청 확인',confirm:v.id}});assert.equal(removed.cleanupPending,true);assert.equal(service.store.one('SELECT status FROM videos WHERE id=?',v.id).status,'deleting');await a.call('/videos/'+v.id+'/file',{status:404});await rm(original,{recursive:true});await rename(original+'.hold',original);await processDeletions(service.store);assert.equal(service.store.one('SELECT COUNT(*) n FROM cleanup_jobs').n,0);await a.call('/videos/'+v.id+'/file',{status:404});assert.equal((await a.call('/me')).wallet.earned,3000);assert.equal((await a.call('/videos/'+v.id)).video.status,'deleted');assert.equal((await a.call('/videos/'+v.id)).annotations.length,0);
 const userA=(await a.call('/session')).user.id;await admin.call('/admin/members/'+userA,{method:'PATCH',body:{status:'suspended',notes:'test'}});await a.call('/me',{status:401});
 checks.push('support replies, recoverable failed file deletion/private access denied, cleanup retry, earnings retained, suspended session invalidation');
 const count=service.store.one('SELECT COUNT(*) n FROM users').n;await service.close();await start();assert.equal(service.store.one('SELECT COUNT(*) n FROM users').n,count);assert.equal(service.store.one('SELECT COUNT(*) n FROM entries').n,1);checks.push('SQLite restart persistence');
 console.log(JSON.stringify({status:'passed',checks},null,2));
}finally{await service?.close();await rm(directory,{recursive:true,force:true});}
