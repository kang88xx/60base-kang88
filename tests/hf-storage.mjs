import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHfStorage,HfStorageError} from '../server/hf-storage.mjs';

const ACCESS='HFAKEXAMPLE';
const SECRET='wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
const FIXED_DATE=new Date('2013-05-24T00:00:00.000Z');
const checks=[];

function makeClient(fetchImpl){
 return createHfStorage({bucket:'owner/videos',accessKeyId:ACCESS,secretAccessKey:SECRET,fetchImpl,endpoint:'http://localhost:4187',now:()=>FIXED_DATE,timeoutMs:0});
}

function headersObject(headers){
 if(headers?.entries)return Object.fromEntries(headers.entries());
 return {...headers};
}
function sha256(value){return createHash('sha256').update(value).digest('hex');}
function hmac(key,value,encoding){return createHmac('sha256',key).update(value,'utf8').digest(encoding);}
function expectedSignature({method,path,query='',headers,payloadHash}){
 const canonicalHeaders=Object.entries(headers).map(([k,v])=>[k.toLowerCase(),String(v).trim().replace(/\s+/g,' ')]).sort(([a],[b])=>a.localeCompare(b));
 const signedHeaders=canonicalHeaders.map(([k])=>k).join(';');
 const canonicalRequest=[method,path,query,canonicalHeaders.map(([k,v])=>`${k}:${v}\n`).join(''),signedHeaders,payloadHash].join('\n');
 const scope='20130524/us-east-1/s3/aws4_request';
 const stringToSign=['AWS4-HMAC-SHA256','20130524T000000Z',scope,sha256(canonicalRequest)].join('\n');
 const kDate=hmac(`AWS4${SECRET}`,'20130524');
 const kRegion=hmac(kDate,'us-east-1');
 const kService=hmac(kRegion,'s3');
 const kSigning=hmac(kService,'aws4_request');
 return hmac(kSigning,stringToSign,'hex');
}
function signatureFrom(authorization){
 const match=/Signature=([a-f0-9]{64})$/.exec(authorization);
 assert.ok(match,authorization);
 return match[1];
}

{
 const calls=[];
 const storage=makeClient(async (url,init)=>{
  calls.push({url:new URL(url),init,headers:headersObject(init.headers)});
  return new Response('',{status:200,headers:{ETag:'"new-etag"'}});
 });
 const result=await storage.put('clips/a b.mp4',Buffer.from('hello'),{contentType:'video/mp4',ifMatch:'"old-etag"'});
 assert.equal(result.etag,'"new-etag"');
 assert.equal(calls.length,1);
 const call=calls[0];
 assert.equal(call.url.pathname,'/owner/videos/clips/a%20b.mp4');
 assert.equal(call.init.redirect,'manual');
 assert.equal(call.headers['content-type'],'video/mp4');
 assert.equal(call.headers['content-length'],'5');
 assert.equal(call.headers['if-match'],'"old-etag"');
 assert.equal(call.headers['x-amz-content-sha256'],sha256('hello'));
 assert.equal(call.headers['x-amz-date'],'20130524T000000Z');
 assert.equal(call.headers.authorization.includes('Credential=HFAKEXAMPLE/20130524/us-east-1/s3/aws4_request'),true);
 assert.equal(signatureFrom(call.headers.authorization),expectedSignature({
  method:'PUT',
  path:'/owner/videos/clips/a%20b.mp4',
  headers:{
   'content-length':'5',
   'content-type':'video/mp4',
   host:'localhost:4187',
   'if-match':'"old-etag"',
   'x-amz-content-sha256':sha256('hello'),
   'x-amz-date':'20130524T000000Z'
  },
  payloadHash:sha256('hello')
 }));
 checks.push('buffer PutObject path-style request signs HF path, content hash, quoted ETag and conditions');
}

{
 const calls=[];
 const storage=makeClient(async (url,init)=>{
  calls.push({url:new URL(url),init,headers:headersObject(init.headers),body:init.body});
  return new Response('',{status:201,headers:{ETag:'"file-etag"'}});
 });
 const directory=await mkdtemp(path.join(os.tmpdir(),'hf-storage-'));
 try{
  const file=path.join(directory,'clip.bin');
  await writeFile(file,Buffer.from('streamed file payload'));
  const result=await storage.putFile('raw/clip.bin',file,{contentType:'application/octet-stream',ifNoneMatch:'*'});
  assert.equal(result.etag,'"file-etag"');
  assert.equal(result.size,21);
  assert.equal(result.sha256,sha256('streamed file payload'));
  assert.equal(calls[0].headers['if-none-match'],'*');
  assert.equal(calls[0].headers['content-length'],'21');
  assert.equal(calls[0].headers['x-amz-content-sha256'],sha256('streamed file payload'));
  assert.notEqual(Buffer.isBuffer(calls[0].body),true);
  assert.equal(calls[0].init.duplex,'half');
 }finally{
  await rm(directory,{recursive:true,force:true});
 }
 checks.push('putFile precomputes SHA-256 by stream and sends a fresh file stream without buffering the file body');
}

{
 const calls=[];
 const storage=makeClient(async (url,init)=>{
  calls.push({url:new URL(url),init,headers:headersObject(init.headers)});
  if(calls.length===1)return new Response('',{status:302,headers:{Location:'https://cdn-lfs.hf.co/owner/videos/clips/a.mp4?X-Amz-Signature=cdn'}});
  return new Response('partial',{status:206,headers:{ETag:'"range-etag"', 'Content-Range':'bytes 0-6/20'}});
 });
 const response=await storage.get('clips/a.mp4',{range:'bytes=0-6'});
 assert.equal(response.status,206);
 assert.equal(response.headers.get('etag'),'"range-etag"');
 assert.equal(await response.text(),'partial');
 assert.equal(calls.length,2);
 assert.ok(calls[0].headers.authorization);
 assert.equal(calls[0].headers.range,'bytes=0-6');
 assert.equal(calls[1].url.hostname,'cdn-lfs.hf.co');
 assert.equal(calls[1].headers.authorization,undefined);
 assert.equal(calls[1].headers.Range||calls[1].headers.range,'bytes=0-6');
 checks.push('GetObject follows one trusted HTTPS HF CDN redirect and strips SigV4 Authorization');
}

{
 const storage=makeClient(async (url,init)=>{
  assert.equal(new URL(url).pathname,'/owner/videos/raw/clip.bin');
  assert.equal(init.redirect,'manual');
  return new Response('',{status:200,headers:{ETag:'"head-etag"','Content-Length':'123'}});
 });
 assert.deepEqual(await storage.head('raw/clip.bin'),{etag:'"head-etag"',size:123});
 checks.push('HeadObject returns opaque ETag and parsed content length');
}

{
 let calls=0;
 const storage=makeClient(async ()=>{
  calls+=1;
  return new Response('token HFAKEXAMPLE secret '+SECRET,{status:412,headers:{'x-amz-error-code':'PreconditionFailed'}});
 });
 await assert.rejects(()=>storage.put('clips/cas.mp4',Buffer.from('new'),{ifMatch:'"stale"'}),error=>{
  assert.ok(error instanceof HfStorageError);
  assert.equal(error.status,412);
  assert.equal(error.code,'PRECONDITION_FAILED');
  assert.equal(error.message.includes(ACCESS),false);
  assert.equal(error.message.includes(SECRET),false);
  return true;
 });
 assert.equal(calls,1);
 checks.push('conditional PutObject conflict is sanitized and not retried');
}

{
 const storage=makeClient(async ()=>new Response('missing body with token '+SECRET,{status:404}));
 assert.deepEqual(await storage.remove('clips/missing.mp4'),{deleted:false});
 checks.push('DeleteObject treats 404 as idempotent success');
}

{
 const storage=makeClient(async ()=>new Response('',{status:302,headers:{Location:'http://127.0.0.1/internal'}}));
 await assert.rejects(()=>storage.get('clips/redirect.mp4'),error=>{
  assert.equal(error.status,502);
  assert.equal(error.code,'UPSTREAM_REDIRECT');
  assert.equal(error.message.includes('127.0.0.1'),false);
  return true;
 });
 checks.push('untrusted download redirects fail closed without exposing target details');
}

{
 assert.throws(()=>createHfStorage({bucket:'owner/videos',accessKeyId:ACCESS,secretAccessKey:SECRET,fetchImpl:async()=>{},endpoint:'http://s3.hf.co'}),/HTTPS/);
 assert.throws(()=>createHfStorage({bucket:'owner/videos/extra',accessKeyId:ACCESS,secretAccessKey:SECRET,fetchImpl:async()=>{}}),/Bucket/);
 const storage=makeClient(async ()=>new Response('',{status:200}));
 for(const key of ['../secret','clips//bad','/clips/a.mp4','clips/a.mp4/','clips\\a.mp4','clips/../secret','clips/\nsecret'])await assert.rejects(()=>storage.head(key),{code:'INVALID_KEY'});
 await assert.rejects(()=>storage.get('clips/a.mp4',{range:'items=0-5'}),{code:'INVALID_RANGE'});
 checks.push('endpoint, bucket, key traversal/control-character and Range validation');
}

console.log(JSON.stringify({status:'passed',checks},null,2));
