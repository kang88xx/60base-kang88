import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';

export class HfMemoryStorage{
 constructor(){
  this.objects=new Map();
  this.puts=0;
  this.removes=0;
  this.failNextPutAfterCommit=false;
  this.failPuts=false;
  this.failRemoves=new Set();
 }
 async put(key,body,{contentType='application/octet-stream',ifMatch,ifNoneMatch}={}){
  const bytes=Buffer.from(body);
  return this.#putBytes(key,bytes,{contentType,ifMatch,ifNoneMatch});
 }
 async putFile(key,file,{contentType='application/octet-stream',ifMatch,ifNoneMatch,size,sha256}={}){
  const chunks=[];
  for await(const chunk of createReadStream(file))chunks.push(Buffer.from(chunk));
  const bytes=Buffer.concat(chunks);
  if(size!==undefined&&bytes.length!==size)throw Object.assign(new Error('size mismatch'),{status:400});
  if(sha256&&hash(bytes)!==sha256)throw Object.assign(new Error('sha mismatch'),{status:400});
  return this.#putBytes(key,bytes,{contentType,ifMatch,ifNoneMatch});
 }
 async get(key,{range}={}){
  const object=this.objects.get(key);
  if(!object)throw Object.assign(new Error('missing'),{status:404});
  let start=0,end=object.body.length-1,status=200,headers={'Content-Type':object.contentType,'Content-Length':String(object.body.length),ETag:object.etag};
  if(range){
   const match=/^bytes=(\d*)-(\d*)$/.exec(range);
   if(!match)throw Object.assign(new Error('bad range'),{status:416});
   start=match[1]?Number(match[1]):Math.max(0,object.body.length-Number(match[2]));
   end=match[1]&&match[2]?Math.min(Number(match[2]),object.body.length-1):end;
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=object.body.length)throw Object.assign(new Error('bad range'),{status:416});
   status=206;
   headers={...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${object.body.length}`};
  }
  return new Response(object.body.subarray(start,end+1),{status,headers});
 }
 async head(key){
  const object=this.objects.get(key);
  if(!object)throw Object.assign(new Error('missing'),{status:404});
  return {etag:object.etag,size:object.body.length};
 }
 async remove(key){
  this.removes+=1;
  if(this.failRemoves.has(key))throw Object.assign(new Error('remove failed'),{status:503});
  const existed=this.objects.delete(key);
  return {deleted:existed};
 }
 keys(){return [...this.objects.keys()].sort();}
 bytes(key){return this.objects.get(key)?.body;}
 #putBytes(key,bytes,{contentType,ifMatch,ifNoneMatch}){
  if(this.failPuts)throw Object.assign(new Error('put failed'),{status:503});
  this.puts+=1;
  const current=this.objects.get(key);
  if(ifNoneMatch==='*'&&current)throw Object.assign(new Error('precondition'),{status:412});
  if(ifMatch&&current?.etag!==ifMatch)throw Object.assign(new Error('precondition'),{status:412});
  const generation=(current?.generation||0)+1;
  const etag=`"mem-${generation}-${hash(bytes).slice(0,12)}"`;
  this.objects.set(key,{body:Buffer.from(bytes),etag,generation,contentType});
  if(this.failNextPutAfterCommit){
   this.failNextPutAfterCommit=false;
   throw Object.assign(new Error('timeout after commit'),{status:504});
  }
  return {etag};
 }
}

export function hash(bytes){
 return createHash('sha256').update(bytes).digest('hex');
}

