import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createService} from '../server/app.mjs';
import {createHfMedia} from '../server/hf-media.mjs';
import {createHfState} from '../server/hf-state.mjs';
import {hashPassword} from '../server/security.mjs';
import {HfMemoryStorage,hash} from './helpers/hf-memory-storage.mjs';

const storage=new HfMemoryStorage();
const stateKey=randomBytes(32).toString('base64');
const base='http://localhost:4491';
const gatewayKey='gateway-secret';
const video=await readFile(new URL('../assets/videos/collection/folding-clothes.mp4',import.meta.url));
let service;
let directory;
const checks=[];

async function start({allowInitialize=false,verifyFirebase=async()=>({uid:'firebase-admin',email:'60base.ai@gmail.com',name:'Google 관리자',registration:{terms:true,privacy:true,adult:true}})}={}){
 directory=await mkdtemp(path.join(os.tmpdir(),'hf-ops-'));
 const state=createHfState({storage,directory,encryptionKey:stateKey,allowInitialize});
 const restored=await state.restore();
 const media=createHfMedia({storage,checkpoint:store=>state.checkpoint(store),assertCurrent:()=>state.assertCurrent()});
 service=createService({directory,origin:base,persistence:state,media,verifyFirebase,gatewayKey});
 await state.checkpoint(service.store);
 await service.maintenance();
 await new Promise(resolve=>service.server.listen(4491,'127.0.0.1',resolve));
 return {restored,state};
}
async function stop(){
 service?.server?.closeAllConnections?.();
 await service?.close();
 if(directory)await rm(directory,{recursive:true,force:true});
 service=null;
 directory=null;
}
function client({gateway=true}={}){
 return {cookie:'',csrf:'',gateway,async call(route,{method='GET',body,raw,headers={},status=200,text=false}={}){
  const requestHeaders={Origin:base,Cookie:this.cookie,'X-CSRF-Token':this.csrf,...(this.gateway?{'X-Dongjakso-Gateway-Key':gatewayKey}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers};
  const response=await fetch(base+'/api'+route,{method,headers:requestHeaders,body:raw??(body?JSON.stringify(body):undefined)});
  const payload=text?await response.text():await response.text().then(value=>{try{return JSON.parse(value);}catch{return value;}});
  assert.equal(response.status,status,`${method} ${route}: ${typeof payload==='string'?payload:JSON.stringify(payload).slice(0,300)}`);
  const setCookie=response.headers.get('set-cookie');
  if(setCookie)this.cookie=setCookie.split(';')[0];
  if(payload?.csrf)this.csrf=payload.csrf;
  return {response,payload};
 }}; 
}
async function seedAdmin(email='admin@example.test'){
 const pw='Testing-secure-Password-2026';
 const now=service.store.now();
 service.store.run("INSERT INTO users(id,email,password,name,role,createdAt,updatedAt,forcePassword) VALUES(?,?,?,?,?,?,?,?)",'admin',email,await hashPassword(pw),'QA 관리자','admin',now,now,0);
 return {email,password:pw};
}
async function uploadVideo(user){
 const metadata={taskId:'folding-clothes',title:'실제 HF 영상',filename:'folding.mp4',size:video.length,mime:'video/mp4',duration:300,width:1920,height:1080};
 const {payload:created}=await user.call('/uploads',{method:'POST',status:201,body:metadata});
 let firstChunkStored=false;
 for(let offset=0;offset<video.length;offset+=created.chunkSize){
  await user.call(`/uploads/${created.id}?offset=${offset}`,{method:'PUT',raw:video.subarray(offset,offset+created.chunkSize)});
  if(offset===0)firstChunkStored=storage.keys().includes(`staging/${created.id}/0`);
 }
 const {payload:completed}=await user.call(`/uploads/${created.id}/complete`,{method:'POST',body:{},status:201});
 return {uploadId:created.id,videoId:completed.id,chunkSize:created.chunkSize,firstChunkStored};
}
async function registerMember(user,email='member@example.test'){
 await user.call('/auth/register',{method:'POST',status:201,body:{email,password:'Testing-secure-Password-2026',name:'참여자',terms:true,privacy:true,adult:true}});
}

try{
 await start({allowInitialize:true});

 {
  const blocked=client({gateway:false});
  await blocked.call('/session',{status:403});
  checks.push('missing HF gateway key is rejected before exposing operations APIs');
 }

 const adminLogin=await seedAdmin('60base.ai@gmail.com');
 const admin=client(),member=client(),anon=client();
 await admin.call('/auth/login',{method:'POST',body:{email:adminLogin.email,password:adminLogin.password}});
 await registerMember(member);

 {
  const firebaseClient=client();
  await firebaseClient.call('/auth/firebase',{method:'POST',status:409,body:{idToken:'admin-google-token'}});
  checks.push('Firebase identity using an existing operations email cannot elevate or link implicitly');
 }

 const {uploadId,videoId,firstChunkStored}=await uploadVideo(member);
 assert.equal(firstChunkStored,true);
 assert.ok(storage.keys().includes(`videos/${videoId}`));
 assert.equal(hash(storage.bytes(`videos/${videoId}`)),hash(video));
 assert.equal(storage.keys().filter(key=>key.startsWith(`staging/${uploadId}/`)).length,0);
 await member.call(`/videos/${videoId}/submit`,{method:'POST',body:{filming:true,privacy:true,usage:true,training:true,recordedInKorea:true}});
 const range=await fetch(`${base}/api/videos/${videoId}/file`,{headers:{Cookie:member.cookie,Range:'bytes=0-63','X-Dongjakso-Gateway-Key':gatewayKey}});
 assert.equal(range.status,206);
 assert.equal(range.headers.get('content-range'),`bytes 0-63/${video.length}`);
 assert.deepEqual(Buffer.from(await range.arrayBuffer()),video.subarray(0,64));
 checks.push('chunk upload stores remote staging/video objects and authenticated Range playback streams from HF media');

 const memberCookie=member.cookie;
 const beforeRestartKeys=storage.keys();
 await stop();
 const restart=await start();
 assert.equal(restart.restored,true);
 assert.deepEqual(storage.keys(),beforeRestartKeys);
 member.cookie=memberCookie;
 const afterRestart=await fetch(`${base}/api/videos/${videoId}/file`,{headers:{Cookie:member.cookie,Range:'bytes=64-127','X-Dongjakso-Gateway-Key':gatewayKey}});
 assert.equal(afterRestart.status,206);
 assert.deepEqual(Buffer.from(await afterRestart.arrayBuffer()),video.subarray(64,128));
 checks.push('ephemeral runtime restart restores authoritative SQLite state and serves the final video from remote storage');

 await admin.call('/auth/login',{method:'POST',body:{email:adminLogin.email,password:adminLogin.password}});
 const {payload:dataBefore}=await admin.call('/admin/data');
 const reviewVideo=dataBefore.videos.find(row=>row.id===videoId);
 for(const stage of ['ai','manual','client'])await admin.call(`/admin/videos/${videoId}/review`,{method:'POST',body:{stage,decision:'approved',revision:reviewVideo.revision,checks:{framing:true,hands:true,privacy:true,completion:true}}});
 const {payload:meAfterApproval}=await member.call('/me');
 assert.equal(meAfterApproval.wallet.earned,3000);
 const {payload:csvResult}=await admin.call('/admin/export?type=audit',{text:true});
 assert.match(csvResult,/data\.export/);
 checks.push('admin approval persists a single reward ledger row and audit CSV export records the export');

 storage.failRemoves.add(`videos/${videoId}`);
 await admin.call(`/admin/videos/${videoId}/remove`,{method:'POST',body:{reason:'삭제 복구 테스트',confirm:videoId}});
 assert.equal(storage.bytes(`videos/${videoId}`)?.length,video.length);
 assert.equal(service.store.one('SELECT COUNT(*) n FROM cleanup_jobs WHERE videoId=?',videoId).n,1);
 storage.failRemoves.delete(`videos/${videoId}`);
 await stop();
 await start();
 await admin.call('/auth/login',{method:'POST',body:{email:adminLogin.email,password:adminLogin.password}});
 await admin.call('/admin/data');
 assert.equal(storage.keys().includes(`videos/${videoId}`),false,'remote video is removed by startup maintenance');
 assert.equal(service.store.one('SELECT status FROM videos WHERE id=?',videoId).status,'deleted');
 assert.equal(service.store.one('SELECT COUNT(*) n FROM cleanup_jobs WHERE videoId=?',videoId).n,0);
 checks.push('durable deletion tombstone survives failed remote delete and cleanup retry completes after restart');

 const bad=client();
 storage.failPuts=true;
 await bad.call('/session');
 assert.equal(service.store.one('SELECT COUNT(*) n FROM users WHERE email=?','late@example.test').n,0);
 await bad.call('/auth/register',{method:'POST',status:503,body:{email:'late@example.test',password:'Testing-secure-Password-2026',name:'Late User',terms:true,privacy:true,adult:true}});
 await bad.call('/session',{status:503});
 storage.failPuts=false;
 checks.push('failed checkpoint denies API success and fenced runtime rejects future reads without post-success durability claims');

 console.log(JSON.stringify({status:'passed',checks},null,2));
}finally{
 await stop();
}
