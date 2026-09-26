import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {createHfState} from '../server/hf-state.mjs';

const KEY=randomBytes(32).toString('base64');
const checks=[];

class MemoryCasStorage{
 constructor(){this.objects=new Map();this.puts=0;this.commitThenThrow=false;}
 async get(key){
  const object=this.objects.get(key);
  if(!object)throw Object.assign(new Error('missing'),{status:404});
  return new Response(Buffer.from(object.body),{status:200,headers:{ETag:object.etag}});
 }
 async head(key){
  const object=this.objects.get(key);
  if(!object)throw Object.assign(new Error('missing'),{status:404});
  return {etag:object.etag,size:object.body.length};
 }
 async put(key,body,{ifMatch,ifNoneMatch}={}){
  this.puts+=1;
  const current=this.objects.get(key);
  if(ifNoneMatch==='*'&&current)throw Object.assign(new Error('precondition'),{status:412});
  if(ifMatch&&current?.etag!==ifMatch)throw Object.assign(new Error('precondition'),{status:412});
  const bytes=Buffer.from(body);
  const generation=(current?.generation||0)+1;
  const etag=`"etag-${generation}"`;
  this.objects.set(key,{body:bytes,etag,generation});
  if(this.commitThenThrow){
   this.commitThenThrow=false;
   throw Object.assign(new Error('timeout'),{status:504});
  }
  return {etag};
 }
 bytes(){return this.objects.get('system/checkpoint.bin')?.body;}
}

async function makeDir(){
 return mkdtemp(path.join(os.tmpdir(),'hf-state-'));
}

function close(store){store?.db?.close();}
function setRevision(store,value){Object.defineProperty(store,'revision',{value,writable:true,configurable:true,enumerable:true});}

async function seedStore(directory){
 const store=openDatabase(directory);
 const now=store.now();
 store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt,bank) VALUES(?,?,?,?,?,?,?,?)','user-1','secret.member@example.test','pw','멤버','member',now,now,store.seal({bank:'테스트은행',holder:'홍길동',number:'123456789012'}));
 store.run('INSERT INTO sessions(token,userId,csrf,expiresAt,createdAt) VALUES(?,?,?,?,?)','session-secret-token','user-1','csrf-token',Date.now()+3600000,Date.now());
 store.run('INSERT INTO ledger(id,userId,amount,kind,reference,createdAt) VALUES(?,?,?,?,?,?)','led-1','user-1',3000,'reward','video-1',now);
 setRevision(store,1);
 return store;
}

{
 const storage=new MemoryCasStorage();
 const directory=await makeDir();
 const state=createHfState({storage,directory,encryptionKey:KEY,allowInitialize:true});
 assert.equal(await state.restore(),false);
 const store=await seedStore(directory);
 const bankKey=await readFile(path.join(directory,'encryption.key'));
 const result=await state.checkpoint(store);
 assert.equal(result.skipped,false);
 assert.equal(result.etag,'"etag-1"');
 assert.equal(result.generation,1);
 const remote=storage.bytes();
 assert.ok(remote.length>0);
 assert.equal(remote.includes(bankKey),false);
 assert.equal(remote.includes(Buffer.from('secret.member@example.test')),false);
 close(store);

 const restoredDir=await makeDir();
 const restoredState=createHfState({storage,directory:restoredDir,encryptionKey:KEY});
 assert.equal(await restoredState.restore(),true);
 const restored=openDatabase(restoredDir);
 assert.equal(restored.one('SELECT email FROM users WHERE id=?','user-1').email,'secret.member@example.test');
 assert.equal(restored.one('SELECT token FROM sessions WHERE userId=?','user-1').token,'session-secret-token');
 assert.equal(restored.wallet('user-1').earned,3000);
 assert.deepEqual(restored.publicUser(restored.one('SELECT * FROM users WHERE id=?','user-1')).bank,{bank:'테스트은행',holder:'홍길동',last4:'9012'});
 assert.deepEqual(await readFile(path.join(restoredDir,'encryption.key')),bankKey);
 close(restored);
 await rm(directory,{recursive:true,force:true});
 await rm(restoredDir,{recursive:true,force:true});
 checks.push('checkpoint restores real SQLite records, session rows and the exact bank encryption key without plaintext remote secrets');
}

{
 const storage=new MemoryCasStorage();
 const failDir=await makeDir();
 const missingState=createHfState({storage,directory:failDir,encryptionKey:KEY});
 await assert.rejects(()=>missingState.restore(),/Explicit initialization/);
 assert.deepEqual(await readdir(failDir),[]);
 const initDir=await makeDir();
 const initState=createHfState({storage,directory:initDir,encryptionKey:KEY,allowInitialize:true});
 assert.equal(await initState.restore(),false);
 assert.deepEqual(await readdir(initDir),[]);
 const store=await seedStore(initDir);
 await initState.checkpoint(store);
 assert.equal(storage.puts,1);
 await initState.checkpoint(store);
 assert.equal(storage.puts,1);
 setRevision(store,2);
 await initState.checkpoint(store);
 assert.equal(storage.puts,2);
 close(store);
 await rm(failDir,{recursive:true,force:true});
 await rm(initDir,{recursive:true,force:true});
 checks.push('missing checkpoint fails unless initialization is explicit, and savedRevision skips only post-initial duplicate checkpoints');
}

{
 const storage=new MemoryCasStorage();
 const directory=await makeDir();
 await writeFile(path.join(directory,'existing'),'do-not-overwrite');
 const state=createHfState({storage,directory,encryptionKey:KEY,allowInitialize:true});
 await assert.rejects(()=>state.restore(),/empty data directory/);
 await rm(directory,{recursive:true,force:true});
 checks.push('restore refuses non-empty runtime directories before bootstrap or overwrite');
}

{
 const storage=new MemoryCasStorage();
 const sourceDir=await makeDir();
 const source=createHfState({storage,directory:sourceDir,encryptionKey:KEY,allowInitialize:true});
 assert.equal(await source.restore(),false);
 const store=await seedStore(sourceDir);
 await source.checkpoint(store);
 close(store);
 const corrupted=Buffer.from(storage.bytes());
 corrupted[corrupted.length-1]^=0xff;
 storage.objects.set('system/checkpoint.bin',{body:corrupted,etag:'"bad"',generation:1});
 const corruptDir=await makeDir();
 const corruptState=createHfState({storage,directory:corruptDir,encryptionKey:KEY});
 await assert.rejects(()=>corruptState.restore(),/Unsupported state or unable to authenticate data|Invalid/);
 assert.deepEqual((await readdir(corruptDir)).sort(),[]);
 storage.objects.set('system/checkpoint.bin',{body:Buffer.from(corrupted.subarray(0,corrupted.length-100)),etag:'"truncated"',generation:1});
 const wrongDir=await makeDir();
 const wrongState=createHfState({storage,directory:wrongDir,encryptionKey:randomBytes(32).toString('base64')});
 await assert.rejects(()=>wrongState.restore());
 await rm(sourceDir,{recursive:true,force:true});
 await rm(corruptDir,{recursive:true,force:true});
 await rm(wrongDir,{recursive:true,force:true});
 checks.push('corrupted or wrong-key checkpoint restores fail closed and remove temporary restore files');
}

{
 const storage=new MemoryCasStorage();
 const initialDir=await makeDir();
 const initialState=createHfState({storage,directory:initialDir,encryptionKey:KEY,allowInitialize:true});
 await initialState.restore();
 const initialStore=await seedStore(initialDir);
 await initialState.checkpoint(initialStore);
 close(initialStore);

 const firstDir=await makeDir(),secondDir=await makeDir();
 const firstState=createHfState({storage,directory:firstDir,encryptionKey:KEY});
 const secondState=createHfState({storage,directory:secondDir,encryptionKey:KEY});
 await firstState.restore();
 await secondState.restore();
 const firstStore=openDatabase(firstDir),secondStore=openDatabase(secondDir);
 setRevision(firstStore,2);
 setRevision(secondStore,2);
 firstStore.run('INSERT INTO ledger(id,userId,amount,kind,reference,createdAt) VALUES(?,?,?,?,?,?)','led-first','user-1',1000,'reward','first',firstStore.now());
 secondStore.run('INSERT INTO ledger(id,userId,amount,kind,reference,createdAt) VALUES(?,?,?,?,?,?)','led-second','user-1',2000,'reward','second',secondStore.now());
 await firstState.checkpoint(firstStore);
 await assert.rejects(()=>secondState.checkpoint(secondStore),{status:503,code:'HF_STATE_FENCED'});
 assert.equal(secondState.healthy,false);
 await assert.rejects(()=>secondState.assertCurrent(),{status:503,code:'HF_STATE_FENCED'});
 close(firstStore);close(secondStore);
 await rm(initialDir,{recursive:true,force:true});
 await rm(firstDir,{recursive:true,force:true});
 await rm(secondDir,{recursive:true,force:true});
 checks.push('two restored writers use CAS so one wins and the stale writer fences all future actions');
}

{
 const storage=new MemoryCasStorage();
 const directory=await makeDir();
 const state=createHfState({storage,directory,encryptionKey:KEY,allowInitialize:true});
 await state.restore();
 const store=await seedStore(directory);
 storage.commitThenThrow=true;
 await assert.rejects(()=>state.checkpoint(store),{status:503,code:'HF_STATE_FENCED'});
 assert.equal(state.healthy,false);
 close(store);
 const restoredDir=await makeDir();
 const restoredState=createHfState({storage,directory:restoredDir,encryptionKey:KEY});
 assert.equal(await restoredState.restore(),true);
 const restored=openDatabase(restoredDir);
 assert.equal(restored.one('SELECT email FROM users WHERE id=?','user-1').email,'secret.member@example.test');
 close(restored);
 await rm(directory,{recursive:true,force:true});
 await rm(restoredDir,{recursive:true,force:true});
 checks.push('successful upstream put followed by client timeout fences locally, and restart restores the committed winner');
}

{
 const storage=new MemoryCasStorage();
 const directory=await makeDir();
 const state=createHfState({storage,directory,encryptionKey:KEY,allowInitialize:true});
 await state.restore();
 const store=await seedStore(directory);
 storage.put=async()=>{throw Object.assign(new Error('precondition'),{status:412});};
 await assert.rejects(()=>state.checkpoint(store),{status:503,code:'HF_STATE_FENCED'});
 assert.equal((await readdir(directory)).some(name=>name.startsWith('checkpoint-')&&name.endsWith('.sqlite')),false);
 close(store);
 await rm(directory,{recursive:true,force:true});
 checks.push('failed checkpoint removes orphan temporary SQLite snapshots');
}

{
 const storage=new MemoryCasStorage();
 storage.get=async()=>new Response(new ReadableStream({
  start(controller){
   controller.enqueue(Buffer.alloc(64*1024*1024));
   controller.enqueue(Buffer.alloc(1));
   controller.close();
  }
 }),{status:200,headers:{ETag:'"huge"'}});
 const directory=await makeDir();
 const state=createHfState({storage,directory,encryptionKey:KEY});
 await assert.rejects(()=>state.restore(),/exceeds/);
 assert.deepEqual(await readdir(directory),[]);
 await rm(directory,{recursive:true,force:true});
 checks.push('restore enforces the documented 64 MiB checkpoint bound before accepting bytes');
}

console.log(JSON.stringify({status:'passed',checks},null,2));
