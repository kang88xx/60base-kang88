// Consistent database snapshot plus private originals. Run on the storage host.
import {backup} from 'node:sqlite';
import {mkdir,copyFile,writeFile,chmod,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openDatabase} from '../server/database.mjs';
const directory=path.resolve(process.env.DONGJAKSO_DATA_DIR||path.join(os.homedir(),'.local/share/dongjakso'));
const destination=path.resolve(process.env.DONGJAKSO_BACKUP_DIR||path.join(directory,'backups'),new Date().toISOString().replaceAll(':','-'));
const store=openDatabase(directory);
try{
 await mkdir(path.join(destination,'videos'),{recursive:true,mode:0o700});
 await backup(store.db,path.join(destination,'dongjakso.sqlite'));
 await copyFile(path.join(directory,'encryption.key'),path.join(destination,'encryption.key'));
 const {DatabaseSync}=await import('node:sqlite'),snapshot=new DatabaseSync(path.join(destination,'dongjakso.sqlite'),{readOnly:true});const videos=snapshot.prepare("SELECT path,size FROM videos WHERE status!='deleted'").all();snapshot.close();
 const missing=[];for(const video of videos){try{await copyFile(path.join(directory,'videos',video.path),path.join(destination,'videos',video.path));}catch(error){missing.push(video.path);}}
 await chmod(path.join(destination,'dongjakso.sqlite'),0o600);await chmod(path.join(destination,'encryption.key'),0o600);
 await writeFile(path.join(destination,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),videos:videos.length,missing,complete:missing.length===0},null,2),{mode:0o600});
 if(missing.length)throw Error('백업 도중 변경되거나 누락된 원본이 있습니다. manifest.json을 확인한 뒤 다시 백업해주세요.');
 console.log('백업 완료: '+destination+'\nDB·암호화 키·영상 원본을 함께 복구해야 합니다.');
}finally{store.db.close();}
