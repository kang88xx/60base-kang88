import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createService} from '../server/app.mjs';
import {createHfState} from '../server/hf-state.mjs';
import {createHfMedia} from '../server/hf-media.mjs';
import {createHfCopiesEraser} from '../server/hf-erasure.mjs';
import {digest} from '../server/security.mjs';
import {HfMemoryStorage} from './helpers/hf-memory-storage.mjs';

const storage=new HfMemoryStorage(),encryptionKey=randomBytes(32).toString('base64');
const origin='http://localhost:4318',directories=[];
let service,identityErasures=0;
async function start(allowInitialize=false){
 const directory=await mkdtemp(path.join(os.tmpdir(),'hf-deletion-'));directories.push(directory);
 const persistence=createHfState({storage,directory,encryptionKey,allowInitialize});
 await persistence.restore();
 service=createService({directory,origin,persistence,
  media:createHfMedia({storage,checkpoint:store=>persistence.checkpoint(store),assertCurrent:()=>persistence.assertCurrent()}),
  copiesEraser:createHfCopiesEraser({storage,directory}),
  identityEraser:{preflight:async({saveEvidence})=>saveEvidence({verified:true}),erase:async()=>{identityErasures++;return {complete:true};}}
 });
 await persistence.checkpoint(service.store);
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
 return directory;
}
function add(user,role='member'){
 const at=service.store.now();
 service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',user,`${user}@example.test`,'hash',user,role,at,at);
 service.store.run('INSERT INTO sessions VALUES(?,?,?,?,?)',digest(user+'-session'),user,user+'-csrf',Date.now()+3600000,Date.now());
}
async function call(route,{user,method='GET',body}={}){
 const response=await fetch(`http://127.0.0.1:${service.server.address().port}/api${route}`,{method,
  headers:{Origin:origin,...(user?{Cookie:`dongjakso_session=${user}-session`,'X-CSRF-Token':user+'-csrf'}:{}),...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,data:await response.json()};
}
try{
 const directory=await start(true);
 add('owner');add('other');add('admin','admin');
 for(const user of ['owner','other']){
  service.store.run('INSERT INTO ledger VALUES(?,?,?,?,?,?)',`ledger-${user}`,user,3000,'reward',`reward-${user}`,service.store.now());
 }
 const requested=await call('/account/deletion',{user:'owner',method:'POST',body:{confirm:'DELETE'}});
 assert.equal(requested.status,202);
 const receipt=requested.data.deletion;
 const unknown=path.join(directory,'checkpoint-unreviewed.sqlite');
 await writeFile(unknown,'unreviewed operator copy');
 const process=()=>call(`/admin/account-deletions/${receipt.id}/process`,{user:'admin',method:'POST',body:{confirm:receipt.id}});
 const blocked=await process();
 assert.equal(blocked.data.deletion.status,'blocked');
 assert.equal(service.store.one('SELECT lastError FROM account_deletions WHERE id=?',receipt.id).lastError,'LOCAL_SNAPSHOT_REVIEW_REQUIRED');
 assert.equal(service.store.one('SELECT status FROM users WHERE id=?','owner').status,'active');
 assert.equal(identityErasures,0);
 assert.equal(await readFile(unknown,'utf8'),'unreviewed operator copy');
 // Only the test owns this fixture; production never auto-removes unknown copies.
 await rm(unknown);
 const completed=await process();
 assert.equal(completed.status,200);
 assert.equal(completed.data.deletion.status,'completed',`HF persistence must not strand its own snapshots: ${service.store.one('SELECT lastError FROM account_deletions WHERE id=?',receipt.id).lastError}`);
 assert.ok(completed.data.deletion.completedAt);
 assert.equal(completed.data.deletion.dueAt,receipt.dueAt);
 assert.equal(identityErasures,1);
 assert.equal(service.store.wallet('owner').balance,0);
 assert.equal(service.store.wallet('other').balance,3000);
 assert.equal((await call('/me',{user:'owner'})).status,401);
 assert.equal((await call('/me',{user:'other'})).status,200);
 assert.equal((await readdir(directory)).some(name=>/^(checkpoint|restore)-/.test(name)),false);
 await service.close();service=null;
 const restoredDirectory=await start();
 const result=await call('/account/deletion/receipt',{method:'POST',body:{receiptToken:receipt.receiptToken}});
 assert.equal(result.status,200);
 assert.equal(result.data.deletion.status,'completed');
 assert.equal(result.data.deletion.completedAt,completed.data.deletion.completedAt);
 assert.equal((await call('/me',{user:'other'})).status,200);
 await createHfCopiesEraser({storage,directory:restoredDirectory}).preflight();
 assert.equal((await readdir(restoredDirectory)).some(name=>/^(checkpoint|restore)-/.test(name)),false);
 console.log('PASS HF-backed deletion: unknown snapshot blocks before erasure and remains intact; exact request retries to completion; normal checkpoints/restores leave no snapshot sidecars; revoked session, unrelated points/session and completed receipt survive restart.');
}finally{
 await service?.close();
 for(const directory of directories)await rm(directory,{recursive:true,force:true});
}
