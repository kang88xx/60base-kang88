import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync,statSync,truncateSync,unlinkSync,readdirSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {unlink} from 'node:fs/promises';
import {fail} from './security.mjs';
const execute=promisify(execFile);
export async function probeVideo(filename){
 try{const binary=process.env.DONGJAKSO_FFPROBE||(existsSync(path.join(os.homedir(),'.local/share/dongjakso-tools/ffprobe'))?path.join(os.homedir(),'.local/share/dongjakso-tools/ffprobe'):'ffprobe');const {stdout}=await execute(binary,['-v','error','-select_streams','v:0','-show_entries','stream=width,height,duration:format=duration','-of','json',filename],{timeout:20000,maxBuffer:65536});const result=JSON.parse(stdout),stream=result.streams?.[0];let duration=Number(stream?.duration||result.format?.duration);if(stream&&(!Number.isFinite(duration)||duration<=0)){const packets=await execute(binary,['-v','error','-select_streams','v:0','-show_entries','packet=pts_time,duration_time','-of','csv=p=0',filename],{timeout:20000,maxBuffer:8388608});let first=Infinity,last=-Infinity;for(const row of packets.stdout.trim().split('\n')){const [pts,span]=row.split(',').map(Number);if(Number.isFinite(pts)){first=Math.min(first,pts);last=Math.max(last,pts+(Number.isFinite(span)&&span>0?span:0));}}duration=last-first;}if(!stream||!Number.isFinite(duration)||duration<=0||duration>1800||!Number.isInteger(stream.width)||!Number.isInteger(stream.height)||stream.width<16||stream.height<16||stream.width>16384||stream.height>16384)fail(400,'영상의 길이 또는 해상도를 확인해주세요.');return {duration,width:stream.width,height:stream.height};}
 catch(e){if(e.status)throw e;if(e.code==='ENOENT')fail(503,'영상 확인 서비스를 준비하고 있습니다. 업로드는 보관되어 있습니다.');fail(400,'재생 가능한 MP4 또는 WebM 영상을 선택해주세요.');}
}
export function recoverUploads(store){
 const cutoff=Date.now()-86400000;
 for(const row of store.all('SELECT * FROM uploads')){const file=path.join(store.directory,'uploads',row.id);if(!existsSync(file)||Date.parse(row.createdAt)<cutoff){if(existsSync(file))unlinkSync(file);store.run('DELETE FROM uploads WHERE id=?',row.id);continue;}const size=statSync(file).size;if(size<row.received){store.run('DELETE FROM uploads WHERE id=?',row.id);unlinkSync(file);}else if(size>row.received)truncateSync(file,row.received);}
 for(const folder of ['uploads','videos'])for(const file of readdirSync(path.join(store.directory,folder))){const full=path.join(store.directory,folder,file);const referenced=store.one(folder==='uploads'?'SELECT id FROM uploads WHERE id=?':'SELECT id FROM videos WHERE path=?',file);if(!referenced&&statSync(full).mtimeMs<cutoff)unlinkSync(full);}
 store.run('DELETE FROM sessions WHERE expiresAt<?',Date.now());store.run('DELETE FROM limits WHERE untilAt<?',Date.now());
}

const cleanupLocks=new WeakSet();
export async function processDeletions(store,{remove,beforeDelete}={}){
 if(cleanupLocks.has(store))return;cleanupLocks.add(store);
 try{for(const job of store.all('SELECT * FROM cleanup_jobs')){
  await beforeDelete?.();
  try{if(remove)await remove(job.file);else await unlink(path.join(store.directory,'videos',job.file)).catch(e=>{if(e.code!=='ENOENT')throw e;});store.transaction(()=>{if(!store.one('SELECT videoId FROM cleanup_jobs WHERE videoId=?',job.videoId))return;store.run("UPDATE videos SET status='deleted',size=0 WHERE id=? AND status='deleting'",job.videoId);store.run('DELETE FROM cleanup_jobs WHERE videoId=?',job.videoId);store.audit(null,'video.remove.complete',job.videoId);});}
  catch(e){store.run('UPDATE cleanup_jobs SET attempts=attempts+1,lastError=? WHERE videoId=?',e.code||e.name,job.videoId);}
 }}finally{cleanupLocks.delete(store);}
}
