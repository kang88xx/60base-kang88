import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHfCopiesEraser} from '../server/hf-erasure.mjs';
const directory=await mkdtemp(path.join(os.tmpdir(),'hf-erasure-'));
try{
 await mkdir(path.join(directory,'backups'));
 const keys=['videos/vid_123','staging/up_123/0'];
 const files=keys.map(file=>({kind:'remote',file}));files.push({kind:'upload',file:'up_123'});
 let checked=[];const missing=createHfCopiesEraser({directory,storage:{head:async key=>{checked.push(key);throw {status:404};}}});
 await missing.preflight();assert.deepEqual(await missing({files}),{erased:true,scope:'application-bucket-objects'});assert.deepEqual(checked,keys);
 const existing=new Set(keys),storage={head:async key=>{if(existing.has(key))return {size:5};throw {status:404};},remove:async key=>existing.delete(key)};
 const erased=createHfCopiesEraser({directory,storage});await assert.rejects(erased({files}),{code:'COPY_ERASURE_OBJECT_PRESENT'});
 for(const key of keys)await storage.remove(key);assert.equal((await erased({files})).erased,true);
 for(const error of [{status:500},{status:403},new TypeError('network')]){
  const failing=createHfCopiesEraser({directory,storage:{head:async()=>{throw error;}}});await assert.rejects(failing({files}),{code:'COPY_ERASURE_CHECK_FAILED'});
 }
 await assert.rejects(missing({files:[{kind:'remote',file:'system/checkpoint.bin'}]}),{code:'COPY_ERASURE_INVALID_KEY'});
 await assert.rejects(missing({files:[{kind:'remote',file:'staging/../../other'}]}),{code:'COPY_ERASURE_INVALID_KEY'});
 await assert.rejects(missing({}),{code:'COPY_ERASURE_MANIFEST_REQUIRED'});
 await writeFile(path.join(directory,'backups','snapshot.sqlite'),'private');await assert.rejects(missing.preflight(),{code:'LOCAL_BACKUP_REVIEW_REQUIRED'});await rm(path.join(directory,'backups','snapshot.sqlite'));
 await writeFile(path.join(directory,'checkpoint-leftover.sqlite'),'private');await assert.rejects(missing.preflight(),{code:'LOCAL_SNAPSHOT_REVIEW_REQUIRED'});
 console.log('HF erasure passed: absent/deleted objects, present object, transport/5xx/403 rejection, exact media key scope, local backup and stale checkpoint preflight');
}finally{await rm(directory,{recursive:true,force:true});}
