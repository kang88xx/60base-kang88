import path from 'node:path';
import {unlink,readdir} from 'node:fs/promises';
import {id,fail,token,digest} from './security.mjs';

// All callers must run through the service's serialized persistence boundary.
export function createAccountDeletionService(store,{media=null,checkpoint=async()=>{},assertCurrent=async()=>{},identityEraser=null,copiesEraser=null}={}){
 const {one,all,run,now,transaction}=store;
 const receipt=row=>row?{id:row.id,status:row.status,stage:row.stage,requestedAt:row.createdAt,updatedAt:row.updatedAt,completedAt:row.completedAt,processingDays:7,dueAt:new Date(Date.parse(row.createdAt)+7*86400000).toISOString()}:null;
 const requireAdmin=actor=>{if(!actor?.id||one('SELECT role,status FROM users WHERE id=?',actor.id)?.role!=='admin'||one('SELECT status FROM users WHERE id=?',actor.id)?.status!=='active')fail(403,'관리자 권한이 필요합니다.');};
 const lastAdmin=user=>{if(user.role==='admin'&&one("SELECT COUNT(*) n FROM users WHERE role='admin' AND status='active' AND id!=?",user.id).n===0)fail(409,'다른 활성 관리자를 지정한 후 삭제를 요청해주세요.');};
 function get(user){
  if(!user?.id||one('SELECT status FROM users WHERE id=?',user.id)?.status!=='active')fail(401,'로그인이 필요합니다.');
  const row=one('SELECT * FROM account_deletions WHERE userId=?',user.id);
  return row?{...receipt(row),...(row.receiptTokenCiphertext?{receiptToken:store.unseal(row.receiptTokenCiphertext)}:{})}:null;
 }
 function lookup(receiptToken){
  if(typeof receiptToken!=='string'||!/^[-_A-Za-z0-9]{43}$/.test(receiptToken))fail(404,'삭제 처리 확인 정보를 찾을 수 없습니다.');
  const row=one('SELECT * FROM account_deletions WHERE receiptTokenHash=?',digest(receiptToken));
  if(!row)fail(404,'삭제 처리 확인 정보를 찾을 수 없습니다.');
  return receipt(row);
 }
 function ensureReceiptToken(row){
  if(row.receiptTokenHash&&row.receiptTokenCiphertext)return;
  const secret=token();
  run('UPDATE account_deletions SET receiptTokenHash=?,receiptTokenCiphertext=? WHERE id=?',digest(secret),store.seal(secret),row.id);
 }

 function request(user){
  if(!user?.id)fail(401,'로그인이 필요합니다.');
  return transaction(()=>{const current=one('SELECT * FROM users WHERE id=?',user.id);if(!current||current.status!=='active')fail(401,'로그인이 필요합니다.');
   const existing=one('SELECT * FROM account_deletions WHERE userId=?',current.id);if(existing){ensureReceiptToken(existing);return get(current);}
   lastAdmin(current);const requestId=id('del');run('INSERT INTO account_deletions(id,userId,createdAt,updatedAt) VALUES(?,?,?,?)',requestId,current.id,now(),now());ensureReceiptToken(one('SELECT * FROM account_deletions WHERE id=?',requestId));store.audit(current,'account.delete.request',requestId);return get(current);
  });
 }
 function list(actor){requireAdmin(actor);return all('SELECT * FROM account_deletions ORDER BY createdAt DESC').map(row=>({...receipt(row),userId:row.userId,actorId:row.actorId,attempts:row.attempts,lastError:row.lastError}));}
 let processing=false;
 async function process(actor,requestId){
  requireAdmin(actor);const job=one('SELECT * FROM account_deletions WHERE id=?',requestId);if(!job)fail(404,'삭제 요청을 찾을 수 없습니다.');if(job.status==='completed')return receipt(job);
  if(processing)fail(409,'삭제 작업을 처리 중입니다.');processing=true;
  try{
   await assertCurrent();const user=one('SELECT * FROM users WHERE id=?',job.userId);lastAdmin(user);
   run("UPDATE account_deletions SET attempts=attempts+1,actorId=?,updatedAt=?,lastError='' WHERE id=?",actor.id,now(),job.id);
   // No account is disabled or data removed until the operator configures the eraser.
   if(typeof identityEraser?.erase!=='function')throw Object.assign(Error(),{code:'ERASER_NOT_CONFIGURED'});
   const needsCopyErasure=!!media||(await readdir(path.join(store.directory,'backups'))).length>0;
   if(needsCopyErasure&&typeof copiesEraser!=='function')throw Object.assign(Error(),{code:'COPY_ERASURE_NOT_CONFIGURED'});
   let evidence=JSON.parse(job.evidence);
   const saveEvidence=async value=>{evidence=value;run('UPDATE account_deletions SET evidence=?,updatedAt=? WHERE id=?',JSON.stringify(value),now(),job.id);await checkpoint();};
   const identities=all('SELECT provider,uid FROM auth_identities WHERE userId=?',user.id);
   if(typeof identityEraser.preflight!=='function')throw Object.assign(Error(),{code:'ERASER_PREFLIGHT_NOT_CONFIGURED'});
   await identityEraser.preflight({userId:user.id,identities,previousEvidence:evidence,saveEvidence,assertCurrent});
   if(needsCopyErasure&&copiesEraser.preflight)await copiesEraser.preflight({userId:user.id,requestId:job.id});
   transaction(()=>{run("UPDATE users SET status='deletion_pending',updatedAt=? WHERE id=?",now(),user.id);run('DELETE FROM sessions WHERE userId=?',user.id);run("UPDATE account_deletions SET status='processing',stage='identity',updatedAt=? WHERE id=?",now(),job.id);});await checkpoint();
   const result=await identityEraser.erase({userId:user.id,identities,previousEvidence:evidence,saveEvidence,assertCurrent});
   if(result?.complete!==true)throw Object.assign(Error(),{code:'IDENTITY_ERASURE_UNVERIFIED'});
   await saveEvidence(result);
   transaction(()=>{
    for(const v of all('SELECT * FROM videos WHERE userId=?',user.id)){
     run('INSERT OR IGNORE INTO account_deletion_files(requestId,kind,file) VALUES(?,?,?)',job.id,media?'remote':'video',v.path);
     run("UPDATE videos SET status='deleting' WHERE id=?",v.id);
    }
    for(const upload of all('SELECT * FROM uploads WHERE userId=?',user.id)){
     run('INSERT OR IGNORE INTO account_deletion_files(requestId,kind,file) VALUES(?,?,?)',job.id,'upload',upload.id);
     if(media){for(const chunk of all('SELECT offset FROM upload_chunks WHERE uploadId=?',upload.id))run('INSERT OR IGNORE INTO account_deletion_files(requestId,kind,file) VALUES(?,?,?)',job.id,'remote',`staging/${upload.id}/${chunk.offset}`);
      run('INSERT OR IGNORE INTO account_deletion_files(requestId,kind,file) VALUES(?,?,?)',job.id,'remote',`videos/${upload.id.replace(/^up_/,'vid_')}`);}
    }
    run("UPDATE account_deletions SET stage='media',updatedAt=? WHERE id=?",now(),job.id);
   });await checkpoint();
   for(const file of all('SELECT * FROM account_deletion_files WHERE requestId=? AND removed=0',job.id)){
    await assertCurrent();
    if(file.kind==='remote'){if(!media)throw Object.assign(Error(),{code:'MEDIA_NOT_CONFIGURED'});await media.remove(file.file);run('DELETE FROM hf_garbage WHERE key=?',file.file);}
    else{if(path.basename(file.file)!==file.file)throw Object.assign(Error(),{code:'INVALID_MEDIA_PATH'});await unlink(path.join(store.directory,file.kind==='video'?'videos':'uploads',file.file)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
    run('UPDATE account_deletion_files SET removed=1 WHERE requestId=? AND kind=? AND file=?',job.id,file.kind,file.file);await checkpoint();
   }
   // Verify removed application-owned remote objects and any supported copies.
   if(media||(await readdir(path.join(store.directory,'backups'))).length){
    run("UPDATE account_deletions SET stage='copies',updatedAt=? WHERE id=?",now(),job.id);await checkpoint();
    if(!copiesEraser)throw Object.assign(Error(),{code:'COPY_ERASURE_NOT_CONFIGURED'});
    const copies=await copiesEraser({userId:user.id,requestId:job.id,files:all('SELECT kind,file FROM account_deletion_files WHERE requestId=?',job.id)});
    if(copies?.erased!==true)throw Object.assign(Error(),{code:'COPY_ERASURE_UNVERIFIED'});
   }
   transaction(()=>{
    for(const identity of identities)run('DELETE FROM apple_refresh_tokens WHERE firebaseUid=?',identity.uid);
    const owned=all('SELECT id FROM videos WHERE userId=?',user.id);
    for(const video of owned){for(const table of ['cleanup_jobs','reviews','annotations'])run(`DELETE FROM ${table} WHERE videoId=?`,video.id);run('DELETE FROM audit WHERE target=?',video.id);}
    for(const table of ['videos','uploads','ledger','payouts','orders','tickets','requests','auth_identities','sessions','app_popup_views'])run(`DELETE FROM ${table} WHERE userId=?`,user.id);
    // Preserve other members' decisions and bookkeeping; the actor becomes an anonymous tombstone.
    run("UPDATE reviews SET reason='',checks='{}' WHERE actorId=?",user.id);run("UPDATE annotations SET note='' WHERE actorId=?",user.id);
    run('DELETE FROM audit WHERE actorId=? OR target=?',user.id,user.id);
    run("UPDATE users SET email=?,password='',name='삭제된 계정',role='member',status='deleted',notes='',consent='{}',bank=NULL,forcePassword=0,updatedAt=? WHERE id=?",`${user.id}@deleted.invalid`,now(),user.id);
    run('DELETE FROM account_deletion_files WHERE requestId=?',job.id);
    run("UPDATE account_deletions SET status='completed',stage='completed',completedAt=?,updatedAt=?,lastError='',evidence='{}',receiptTokenCiphertext='' WHERE id=?",now(),now(),job.id);
    store.audit(actor,'account.delete.complete',job.id);
   });
   // Rebuild away historical free pages before making the next SQLite snapshot.
   // TRUNCATE removes older WAL frames; this is logical local-file sanitization,
   // not a claim about provider/SSD physical blocks or external operator exports.
   store.db.exec('VACUUM');
   const wal=store.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
   if(wal.busy)throw Object.assign(Error(),{code:'LOCAL_WAL_PURGE_BUSY'});
   await checkpoint();return receipt(one('SELECT * FROM account_deletions WHERE id=?',job.id));
  }catch(error){run("UPDATE account_deletions SET status='blocked',completedAt=NULL,lastError=?,updatedAt=? WHERE id=?",/^[A-Z_0-9]{1,64}$/.test(error.code||'')?error.code:'DELETION_FAILED',now(),job.id);await checkpoint();return receipt(one('SELECT * FROM account_deletions WHERE id=?',job.id));}
  finally{processing=false;}
 }
 return {get,request,lookup,list,process};
}
