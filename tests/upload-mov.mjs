import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHfMedia} from '../server/hf-media.mjs';
import {HfMemoryStorage} from './helpers/hf-memory-storage.mjs';
import {createService} from '../server/app.mjs';
const directory=await mkdtemp(path.join(os.tmpdir(),'ego-mov-'));
const storage=process.env.EGO_TEST_HF_MEDIA==='1'?new HfMemoryStorage():null;
const media=storage?createHfMedia({storage,checkpoint:async()=>{},assertCurrent:async()=>{}}):null;
const service=createService({directory,origin:'http://localhost',media});
// Exercise the real HTTP request handler without binding a socket (sandbox compatible).
const {Readable,Writable}=await import('node:stream');
async function request(route,{method='GET',headers={},body}={}){
 const req=Readable.from(body?[Buffer.from(body)]:[]);Object.assign(req,{url:route,method,headers:Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v])),socket:{remoteAddress:'127.0.0.1'}});
 const chunks=[],outHeaders={};
 const res=new Writable({write(chunk,_encoding,done){chunks.push(Buffer.from(chunk));done();}});
 res.setHeader=(name,value)=>outHeaders[name.toLowerCase()]=value;res.getHeader=name=>outHeaders[name.toLowerCase()];res.removeHeader=name=>delete outHeaders[name.toLowerCase()];
 res.writeHead=(status,values={})=>{res.statusCode=status;res.headersSent=true;for(const [k,v] of Object.entries(values))res.setHeader(k,v);return res;};
 const done=new Promise((resolve,reject)=>{res.on('finish',resolve);res.on('error',reject);});service.server.emit('request',req,res);await done;
 const data=Buffer.concat(chunks);return {status:res.statusCode,headers:{get:name=>outHeaders[name.toLowerCase()]},json:async()=>JSON.parse(data),arrayBuffer:async()=>data};
}
let cookie='',csrf='';
async function call(route,{method='GET',body,raw,status=200}={}){
 const response=await request('/api'+route,{method,headers:{Origin:'http://localhost',Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':'application/json'}:{})},body:raw||(body?JSON.stringify(body):undefined)});
 const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));
 if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];if(data.csrf)csrf=data.csrf;return data;
}
try{
 await call('/auth/register',{method:'POST',status:201,body:{email:'mov@example.test',password:'Testing-secure-Password-2026',name:'MOV QA',terms:true,privacy:true,adult:true}});
 const fixture={};
 for(const [extension,codec,mime] of [['mov','libx264','video/quicktime'],['mp4','libx264','video/mp4'],['webm','libvpx','video/webm']]){
  const file=path.join(directory,'fixture.'+extension);
  execFileSync(process.env.EGO_FFMPEG||'/opt/homebrew/bin/ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x48:r=10','-t','1','-c:v',codec,'-y',file]);
  fixture[mime]=await readFile(file);
 }
 async function upload(buffer,mime,{completeStatus=201}={}){
  const up=await call('/uploads',{method:'POST',status:201,body:{taskId:'folding-clothes',title:'영상',filename:'fixture',mime,size:buffer.length,duration:1,width:64,height:48}});
  for(let offset=0;offset<buffer.length;offset+=up.chunkSize)await call(`/uploads/${up.id}?offset=${offset}`,{method:'PUT',raw:buffer.subarray(offset,offset+up.chunkSize)});
  return call(`/uploads/${up.id}/complete`,{method:'POST',body:{},status:completeStatus});
 }
 for(const [mime,buffer] of Object.entries(fixture)){
  const video=await upload(buffer,mime),details=await call('/videos/'+video.id);assert.equal(details.video.mime,mime);assert.equal(details.video.width,64);
  if(storage){const stored=storage.objects.get('videos/'+video.id);assert.equal(stored.contentType,mime);assert.deepEqual(stored.body,buffer);}
  assert.equal(details.video.height,48);assert.ok(details.video.duration>0);
  const denied=await call('/videos/'+video.id+'/submit',{method:'POST',body:{},status:400});assert.equal(denied.code,'upload_consent');
  await call('/videos/'+video.id+'/submit',{method:'POST',body:{filming:true,privacy:true,usage:true,training:true,recordedInKorea:true}});
  const response=await request('/api/videos/'+video.id+'/file',{headers:{Cookie:cookie}});assert.equal(response.headers.get('content-type'),mime);assert.deepEqual(Buffer.from(await response.arrayBuffer()),buffer);
  const range=await request('/api/videos/'+video.id+'/file',{headers:{Cookie:cookie,Range:'bytes=0-31'}});assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),buffer.subarray(0,32));
 }
 for(const [bytes,mime] of [[fixture['video/quicktime'],'video/mp4'],[fixture['video/mp4'],'video/quicktime'],[fixture['video/webm'],'video/mp4'],[Buffer.alloc(64),'video/quicktime'],[Buffer.concat([fixture['video/quicktime'].subarray(0,32),Buffer.alloc(64)]),'video/quicktime']]){
  const error=await upload(bytes,mime,{completeStatus:400});assert.equal(error.code,'upload_format');
 }
 await call('/uploads',{method:'POST',status:400,body:{taskId:'folding-clothes',title:'영상',filename:'bad',mime:'image/png',size:64,width:64,height:48}});
 console.log('PASS: real MOV/MP4/WebM upload, consent, exact storage/serve/range, malformed and relabelled rejection');
}finally{await service.close();await rm(directory,{recursive:true,force:true});}
