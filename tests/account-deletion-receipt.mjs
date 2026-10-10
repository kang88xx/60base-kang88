import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {proxyOperations} from '../api/operations.js';
import {createService} from '../server/app.mjs';
import {digest} from '../server/security.mjs';
const directory=await mkdtemp(path.join(os.tmpdir(),'deletion-receipt-'));
const origin='http://localhost:4318';
let service;
async function start(){
 service=createService({directory,origin,identityEraser:{preflight:async()=>{},erase:async()=>({complete:true})}});
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
}
await start();
// Exercise the production proxy boundary as well as the actual backend (including its CSRF guard).
const proxy=createServer((req,res)=>proxyOperations(req,res,{
 env:{DONGJAKSO_HF_SPACE_URL:'https://test-operations.hf.space',DONGJAKSO_GATEWAY_KEY:'test-only',HF_TOKEN:'test-only'},
 fetchImpl:(url,init)=>fetch(`http://127.0.0.1:${service.server.address().port}${new URL(url).pathname}`,init),
}));
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
function add(id,role='member'){
 const at=service.store.now();
 service.store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',id,`${id}@example.test`,'hash',id,role,at,at);
 service.store.run('INSERT INTO sessions VALUES(?,?,?,?,?)',digest(id+'-session'),id,id+'-csrf',Date.now()+3600000,Date.now());
}
async function call(route,{user,method='GET',body,headers={}}={}){
 const response=await fetch(`http://127.0.0.1:${proxy.address().port}/api/operations?path=${encodeURIComponent(route)}`,{method,headers:{Origin:origin,...(user?{Cookie:`dongjakso_session=${user}-session`,'X-CSRF-Token':user+'-csrf'}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,headers:response.headers,data:await response.json()};
}
try{
 add('owner');add('other');add('admin','admin');
 const request=await call('/account/deletion',{user:'owner',method:'POST',body:{confirm:'DELETE'}});
 assert.equal(request.status,202);
 const receipt=request.data.deletion,secret=receipt.receiptToken;
 assert.match(secret,/^[-_A-Za-z0-9]{43}$/);
 assert.equal(Date.parse(receipt.dueAt)-Date.parse(receipt.requestedAt),7*86400000);
 const row=service.store.one('SELECT * FROM account_deletions WHERE id=?',receipt.id);
 assert.equal(row.receiptTokenHash,digest(secret));assert.notEqual(row.receiptTokenCiphertext,secret);
 assert.equal(JSON.stringify(row).includes(secret),false);
 const again=await call('/account/deletion',{user:'owner',method:'POST',body:{confirm:'DELETE'}});
 assert.equal(again.data.deletion.receiptToken,secret);assert.equal(again.data.deletion.dueAt,receipt.dueAt);
 assert.equal((await call('/account/deletion',{user:'other'})).data.deletion,null);
 const listed=await call('/admin/account-deletions',{user:'admin'});
 assert.equal(JSON.stringify(listed.data).includes(secret),false);assert.equal('receiptTokenCiphertext' in listed.data.deletions[0],false);
 for(const value of [undefined,receipt.id,'x'.repeat(43),secret.slice(0,-1)+'!',{'value':secret}]){
  const result=await call('/account/deletion/receipt',{method:'POST',body:{receiptToken:value}});assert.equal(result.status,404);
 }
 const pending=await call('/account/deletion/receipt',{method:'POST',body:{receiptToken:secret}});
 assert.equal(pending.status,200);assert.equal(pending.data.deletion.status,'pending');assert.equal(pending.headers.get('cache-control'),'no-store');
 assert.equal('receiptToken' in pending.data.deletion,false);assert.equal('userId' in pending.data.deletion,false);
 for(const csrf of ['', 'wrong']) assert.equal((await call('/account/deletion/receipt',{user:'owner',method:'POST',body:{receiptToken:secret},headers:{'X-CSRF-Token':csrf}})).status,403);
 assert.equal((await call('/account/deletion/receipt',{user:'owner',method:'POST',body:{receiptToken:secret}})).status,200);
 assert.equal((await call('/account/deletion/receipt',{method:'POST',body:{receiptToken:secret},headers:{Cookie:'dongjakso_session=stale','X-CSRF-Token':''}})).status,200);
 for(const headers of [{Origin:'https://evil.test'},{Cookie:'invalid=%FF'}]) assert.equal((await call('/account/deletion/receipt',{method:'POST',body:{receiptToken:secret},headers})).status,403);
 // The real destructive service path runs only against this isolated temporary account.
 const done=await call(`/admin/account-deletions/${receipt.id}/process`,{user:'admin',method:'POST',body:{confirm:receipt.id}});
 assert.equal(done.status,200);assert.equal(done.data.deletion.status,'completed');
 assert.equal((await call('/account/deletion',{user:'owner'})).status,401);
 assert.equal(service.store.one('SELECT status FROM users WHERE id=?','owner').status,'deleted');
 assert.equal(service.store.one('SELECT receiptTokenCiphertext FROM account_deletions WHERE id=?',receipt.id).receiptTokenCiphertext,'');
 const completed=await call('/account/deletion/receipt',{method:'POST',body:{receiptToken:secret}});
 assert.equal(completed.data.deletion.status,'completed');assert.ok(completed.data.deletion.completedAt);
 assert.deepEqual(Object.keys(completed.data.deletion).sort(),['id','status','stage','requestedAt','updatedAt','completedAt','processingDays','dueAt'].sort());
 assert.equal((await call('/me',{user:'other'})).status,200);
 assert.equal((await call('/account/deletion',{method:'POST',body:{confirm:'DELETE',receiptToken:secret}})).status,403);
 await service.close();await start();
 const restarted=await call('/account/deletion/receipt',{method:'POST',body:{receiptToken:secret}});
 assert.equal(restarted.data.deletion.status,'completed');assert.equal(restarted.data.deletion.completedAt,completed.data.deletion.completedAt);
 // Existing requests from the previous version remain the same request when provisioned with a credential.
 add('legacy');const at=service.store.now();
 service.store.run('INSERT INTO account_deletions(id,userId,createdAt,updatedAt) VALUES(?,?,?,?)','del_legacy','legacy',at,at);
 const legacy=await call('/account/deletion',{user:'legacy',method:'POST',body:{confirm:'DELETE'}});
 assert.equal(legacy.data.deletion.id,'del_legacy');assert.match(legacy.data.deletion.receiptToken,/^[-_A-Za-z0-9]{43}$/);
 console.log('PASS receipt through production proxy and real backend: guest/stale session lookup, active-session CSRF and origin/cookie rejection, 7-day due date, stable private credential, invalid token/privacy isolation, revoked sessions stay denied, real completion visible without login, restart durability, legacy request migration.');
}finally{await new Promise(resolve=>proxy.close(resolve));await service.close();await rm(directory,{recursive:true,force:true});}
