import {readdir} from 'node:fs/promises';
import path from 'node:path';
const blocked=code=>{throw Object.assign(new Error(code),{code});};

// HF Buckets are non-versioned. The deletion service removes exact owned object
// intents first; this adapter verifies absence, never a wider bucket/prefix erase.
export function createHfCopiesEraser({storage,directory}={}){
 if(typeof storage?.head!=='function'||typeof directory!=='string'||!directory)blocked('COPY_ERASURE_NOT_CONFIGURED');
 async function preflight(){
  // Unknown local snapshots are intentionally never deleted automatically.
  if((await readdir(path.join(directory,'backups'))).length)blocked('LOCAL_BACKUP_REVIEW_REQUIRED');
  // A crashed checkpoint can leave a metadata copy outside the backup folder.
  if((await readdir(directory)).some(name=>/^(checkpoint|restore)-.*\.sqlite(?:-wal|-shm)?$/.test(name)))blocked('LOCAL_SNAPSHOT_REVIEW_REQUIRED');
 }
 const erase=async({files})=>{
  await preflight();
  if(!Array.isArray(files))blocked('COPY_ERASURE_MANIFEST_REQUIRED');
  for(const {kind,file} of files){
   if(kind!=='remote')continue;
   if(typeof file!=='string'||!/^videos\/vid_[\w-]+$|^staging\/up_[\w-]+\/\d+$/.test(file))blocked('COPY_ERASURE_INVALID_KEY');
   try{await storage.head(file);}
   catch(error){if(error?.status===404)continue;blocked('COPY_ERASURE_CHECK_FAILED');}
   blocked('COPY_ERASURE_OBJECT_PRESENT');
  }
  return {erased:true,scope:'application-bucket-objects'};
 };
 erase.preflight=preflight;
 return erase;
}
