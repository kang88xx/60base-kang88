import {backup,DatabaseSync} from 'node:sqlite';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdir,readFile,rename,rm,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';

const MAGIC=Buffer.from('DJS-HF-2\0');
const OBJECT_KEY='system/checkpoint.bin';
const MAX_CHECKPOINT=64*1024*1024;
const SQLITE_HEADER='SQLite format 3\0';

function unavailable(){
 return Object.assign(new Error('저장소 연결을 확인하고 있습니다. 잠시 후 다시 시도해주세요.'),{status:503,code:'HF_STATE_FENCED'});
}

// The checkpoint object is capped at 64 MiB. It contains only an AES-256-GCM
// envelope around metadata, the bank encryption key, and a SQLite backup.
export function createHfState({storage,directory,encryptionKey,allowInitialize=false}={}){
 if(!storage||typeof storage.get!=='function'||typeof storage.put!=='function'||typeof storage.head!=='function')throw new Error('HF storage adapter is required.');
 if(typeof directory!=='string'||!directory)throw new Error('HF state directory is required.');
 const key=Buffer.from(encryptionKey||'','base64');
 if(key.length!==32||key.toString('base64')!==encryptionKey)throw new Error('HF_STATE_KEY must be a base64-encoded 32-byte key.');

 let etag=null;
 let generation=0;
 let savedRevision;
 let fenced=false;
 let tail=Promise.resolve();

 function assertHealthy(){if(fenced)throw unavailable();}
 function fence(){fenced=true;throw unavailable();}
 function serial(operation){
  const result=tail.then(async()=>{assertHealthy();return operation();});
  tail=result.catch(()=>{});
  return result;
 }

 async function restore(){
  await mkdir(directory,{recursive:true,mode:0o700});
  if((await readdir(directory)).length)throw new Error('HF restore requires an empty data directory.');
  let response;
  try{response=await storage.get(OBJECT_KEY);}
  catch(error){
   if(error?.status===404&&allowInitialize)return false;
   if(error?.status===404)throw new Error('HF checkpoint is missing. Explicit initialization is required for a new installation.');
   throw error;
  }
  const remoteEtag=response.headers.get('etag');
  if(!remoteEtag)throw new Error('HF checkpoint response must contain an ETag.');
  const encrypted=await readBoundedResponse(response);
  const {meta,bankKey,database}=decryptEnvelope(encrypted,key);
  await restoreFiles({directory,bankKey,database});
  etag=remoteEtag;
  generation=meta.generation;
  savedRevision=undefined;
  return true;
 }

 async function assertCurrent(){
  assertHealthy();
  if(!etag)return fence();
  try{
   const latest=await storage.head(OBJECT_KEY);
   if(latest.etag!==etag)return fence();
  }catch{
   return fence();
  }
 }

 async function checkpoint(store){
  assertHealthy();
  if(etag&&store&&Object.hasOwn(store,'revision')&&savedRevision===store.revision){
   await assertCurrent();
   return {skipped:true,etag,generation};
  }
  const temporary=path.join(directory,`checkpoint-${randomBytes(12).toString('hex')}.sqlite`);
  try{
   await backup(store.db,temporary);
   await verifySqlite(temporary);
   const [database,bankKey]=await Promise.all([
    readFile(temporary),
    readFile(path.join(directory,'encryption.key'))
   ]);
   if(bankKey.length!==32)throw new Error('Invalid bank encryption key.');
   const nextGeneration=generation+1;
   const revision=store&&Object.hasOwn(store,'revision')?store.revision:undefined;
   const body=encryptEnvelope({generation:nextGeneration,revision,createdAt:new Date().toISOString()},bankKey,database,key);
   if(body.length>MAX_CHECKPOINT)throw new Error('HF checkpoint exceeds the supported size.');
   const result=await storage.put(OBJECT_KEY,body,{
    contentType:'application/octet-stream',
    ...(etag?{ifMatch:etag}:{ifNoneMatch:'*'})
   });
   if(!result?.etag)throw new Error('HF checkpoint write must return an ETag.');
   etag=result.etag;
   generation=nextGeneration;
   savedRevision=revision;
   return {skipped:false,etag,generation};
  }catch{
   return fence();
  }finally{
   await rm(temporary,{force:true}).catch(()=>{});
  }
 }

 return {
  restore,serial,assertCurrent,checkpoint,assertHealthy,
  get healthy(){return !fenced;},
  idle:()=>tail
 };
}

async function readBoundedResponse(response){
 const chunks=[];
 let size=0;
 for await (const chunk of response.body){
  size+=chunk.length;
  if(size>MAX_CHECKPOINT)throw new Error('HF checkpoint exceeds the supported size.');
  chunks.push(Buffer.from(chunk));
 }
 return Buffer.concat(chunks);
}

function encryptEnvelope(meta,bankKey,database,key){
 const metaBytes=Buffer.from(JSON.stringify(meta),'utf8');
 if(metaBytes.length>65536)throw new Error('HF checkpoint metadata exceeds the supported size.');
 const metaLength=Buffer.alloc(4);
 metaLength.writeUInt32BE(metaBytes.length);
 const clear=Buffer.concat([metaLength,metaBytes,bankKey,database]);
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(MAGIC);
 const encrypted=Buffer.concat([cipher.update(clear),cipher.final()]);
 return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),encrypted]);
}

function decryptEnvelope(bytes,key){
 if(bytes.length<MAGIC.length+12+16+4+32||!bytes.subarray(0,MAGIC.length).equals(MAGIC))throw new Error('Invalid HF checkpoint format.');
 const ivStart=MAGIC.length,tagStart=ivStart+12,cipherStart=tagStart+16;
 const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(ivStart,tagStart));
 decipher.setAAD(MAGIC);
 decipher.setAuthTag(bytes.subarray(tagStart,cipherStart));
 const clear=Buffer.concat([decipher.update(bytes.subarray(cipherStart)),decipher.final()]);
 const metaLength=clear.readUInt32BE(0);
 const bankStart=4+metaLength,dbStart=bankStart+32;
 if(metaLength>65536||clear.length<dbStart+SQLITE_HEADER.length)throw new Error('Invalid HF checkpoint payload.');
 let meta;
 try{meta=JSON.parse(clear.subarray(4,bankStart).toString('utf8'));}
 catch{throw new Error('Invalid HF checkpoint metadata.');}
 if(!Number.isSafeInteger(meta.generation)||meta.generation<1)throw new Error('Invalid HF checkpoint generation.');
 const database=clear.subarray(dbStart);
 if(database.subarray(0,SQLITE_HEADER.length).toString()!==SQLITE_HEADER)throw new Error('Invalid SQLite checkpoint.');
 return {meta,bankKey:clear.subarray(bankStart,dbStart),database};
}

async function restoreFiles({directory,bankKey,database}){
 const tempDb=path.join(directory,`restore-${randomBytes(12).toString('hex')}.sqlite`);
 try{
  await writeFile(tempDb,database,{flag:'wx',mode:0o600});
  await verifySqlite(tempDb);
  await writeFile(path.join(directory,'encryption.key'),bankKey,{flag:'wx',mode:0o600});
  await rename(tempDb,path.join(directory,'dongjakso.sqlite'));
 }catch(error){
  await rm(tempDb,{force:true}).catch(()=>{});
  await rm(path.join(directory,'encryption.key'),{force:true}).catch(()=>{});
  await rm(path.join(directory,'dongjakso.sqlite'),{force:true}).catch(()=>{});
  throw error;
 }
}

async function verifySqlite(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  const result=db.prepare('PRAGMA integrity_check').get();
  if(!result||Object.values(result)[0]!=='ok')throw new Error('Invalid SQLite checkpoint integrity.');
 }finally{
  db.close();
 }
}
