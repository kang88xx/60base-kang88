import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {createAccountDeletionService} from '../server/account-deletion.mjs';
const directory=await mkdtemp(path.join(os.tmpdir(),'account-delete-'));let store=openDatabase(directory);
try{
 const add=(id,role='member')=>{store.run('INSERT INTO users(id,email,password,name,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',id,`${id}@example.test`,'hash',id,role,store.now(),store.now());return store.one('SELECT * FROM users WHERE id=?',id);};
 const admin=add('admin','admin'),member=add('member'),other=add('other');
 let service=createAccountDeletionService(store);
 assert.throws(()=>service.request(null),{status:401});assert.throws(()=>service.request(admin),{status:409});assert.throws(()=>service.list(member),{status:403});
 const receipt=service.request(member);assert.equal(receipt.status,'pending');assert.equal(service.request(member).id,receipt.id);assert.equal(service.get(other),null);assert.equal('userId' in receipt,false);
 assert.equal((await service.process(admin,receipt.id)).status,'blocked');assert.equal(store.one('SELECT status FROM users WHERE id=?',member.id).status,'active');
 store.db.close();store=openDatabase(directory);service=createAccountDeletionService(store);assert.equal(service.get(member).id,receipt.id);
 for(const user of [member,other]){
  store.run('INSERT INTO ledger VALUES(?,?,?,?,?,?)',`ledger-${user.id}`,user.id,3000,'reward',`reward-${user.id}`,store.now());
  store.run('INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,path,sha,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',`vid-${user.id}`,user.id,'dishwashing','private','name','video/mp4',4,1,100,100,3000,`vid-${user.id}`,`sha-${user.id}`,store.now());
  await writeFile(path.join(directory,'videos',`vid-${user.id}`),'data');
 }
 const target=path.join(directory,'videos','vid-member');await rm(target);await mkdir(target);
 let erasures=0;service=createAccountDeletionService(store,{identityEraser:{preflight:async()=>{},erase:async()=>{erasures++;return {complete:true};}}});
 assert.equal((await service.process(admin,receipt.id)).status,'blocked');assert.equal(store.wallet(member.id).balance,3000);assert.equal(store.one('SELECT status FROM users WHERE id=?',member.id).status,'deletion_pending');
 await rm(target,{recursive:true});await writeFile(target,'data');
 const done=await service.process(admin,receipt.id);assert.equal(done.status,'completed');assert.ok(done.completedAt);assert.equal(store.wallet(member.id).balance,0);assert.equal(store.wallet(other.id).balance,3000);assert.equal(await readFile(path.join(directory,'videos','vid-other'),'utf8'),'data');assert.equal(store.one('SELECT status FROM users WHERE id=?',member.id).status,'deleted');assert.equal((await service.process(admin,receipt.id)).status,'completed');assert.equal(erasures,2);
 assert.equal(store.one('PRAGMA secure_delete').secure_delete,1);assert.equal((await readFile(path.join(directory,'dongjakso.sqlite'))).includes(Buffer.from('member@example.test')),false);assert.equal((await readFile(path.join(directory,'dongjakso.sqlite-wal'))).length,0);
 const protectedMember=add('backup-user');const request2=service.request(protectedMember);await writeFile(path.join(directory,'backups','snapshot'),'private');assert.equal((await service.process(admin,request2.id)).status,'blocked');assert.equal(store.one('SELECT lastError FROM account_deletions WHERE id=?',request2.id).lastError,'COPY_ERASURE_NOT_CONFIGURED');assert.equal(store.one('SELECT status FROM users WHERE id=?',protectedMember.id).status,'active');assert.equal(erasures,2);
 const remoteMember=add('remote-user'),remoteService=createAccountDeletionService(store,{media:{remove:async()=>{throw Error('must not delete');}},identityEraser:{preflight:async()=>{},erase:async()=>{throw Error('must not erase');}}});const remoteRequest=remoteService.request(remoteMember);assert.equal((await remoteService.process(admin,remoteRequest.id)).status,'blocked');assert.equal(store.one('SELECT status FROM users WHERE id=?',remoteMember.id).status,'active');
 console.log('account deletion passed: auth, last admin, ownership, idempotency, restart durability, retry, no premature completion, unrelated media/points, backup gate');
}finally{store.db.close();await rm(directory,{recursive:true,force:true});}
