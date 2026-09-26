import {createHash,createHmac} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';

const REGION='us-east-1';
const SERVICE='s3';
const EMPTY_SHA256='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const DEFAULT_TIMEOUT_MS=30000;

export class HfStorageError extends Error{
 constructor(message,{status=500,code='HF_STORAGE_ERROR'}={}){
  super(message);
  this.name='HfStorageError';
  this.status=status;
  this.code=code;
 }
}

export function createHfStorage({bucket,accessKeyId,secretAccessKey,fetchImpl=globalThis.fetch,endpoint='https://s3.hf.co',now=()=>new Date(),timeoutMs=DEFAULT_TIMEOUT_MS}={}){
 if(!fetchImpl)throw new HfStorageError('Fetch is not available',{status:500,code:'FETCH_UNAVAILABLE'});
 const {namespace,bucketName}=parseBucket(bucket);
 validateCredential(accessKeyId,'accessKeyId');
 validateCredential(secretAccessKey,'secretAccessKey');
 const endpointUrl=parseEndpoint(endpoint);

 async function request(method,key,{headers={},body,bodyHash=EMPTY_SHA256,query,allowGetRedirect=false}={}){
  const url=objectUrl(endpointUrl,namespace,bucketName,key,query);
  const signedHeaders=sign({method,url,headers,bodyHash,accessKeyId,secretAccessKey,now:now()});
  const init={method,headers:signedHeaders,redirect:'manual',signal:timeoutSignal(timeoutMs)};
  if(body!==undefined){
   init.body=body;
   if(!Buffer.isBuffer(body)&&typeof body!=='string')init.duplex='half';
  }
  let response;
  try{response=await fetchImpl(url,init);}
  catch(e){throw fetchFailure(e);}
  if(allowGetRedirect&&isRedirect(response.status)){
   const location=response.headers.get('location');
   const redirectUrl=validateDownloadRedirect(location);
   try{return await fetchImpl(redirectUrl,{method:'GET',headers:headers.Range?{Range:headers.Range}:{},redirect:'error',signal:timeoutSignal(timeoutMs)});}
   catch(e){throw fetchFailure(e);}
  }
  if(isRedirect(response.status))throw new HfStorageError('Unexpected storage redirect',{status:502,code:'UPSTREAM_REDIRECT'});
  return response;
 }

 async function checked(method,key,options,ok){
  const response=await request(method,key,options);
  if(ok(response.status))return response;
  throw upstreamError(response);
 }

 return {
  async put(key,body,{contentType='application/octet-stream',ifMatch,ifNoneMatch}={}){
   validateKey(key);
   if(!Buffer.isBuffer(body))throw new HfStorageError('put body must be a Buffer',{status:400,code:'INVALID_BODY'});
   const headers={
    'Content-Length':String(body.length),
    'Content-Type':contentType,
    ...conditionalHeaders({ifMatch,ifNoneMatch})
   };
   const bodyHash=sha256Hex(body);
   const response=await checked('PUT',key,{headers,body,bodyHash},status=>status>=200&&status<300);
   return {etag:response.headers.get('etag')};
  },
  async putFile(key,file,{contentType='application/octet-stream',ifMatch,ifNoneMatch,size,sha256}={}){
   validateKey(key);
   if(typeof file!=='string'||!file)throw new HfStorageError('putFile requires a file path',{status:400,code:'INVALID_FILE'});
   const info=await stat(file).catch(()=>{throw new HfStorageError('File is not readable',{status:400,code:'INVALID_FILE'});});
   if(!info.isFile())throw new HfStorageError('putFile requires a regular file',{status:400,code:'INVALID_FILE'});
   if(size!==undefined&&size!==info.size)throw new HfStorageError('File size does not match',{status:400,code:'INVALID_FILE_SIZE'});
   const bodyHash=sha256?validateSha256(sha256):await sha256File(file);
   const headers={
    'Content-Length':String(info.size),
    'Content-Type':contentType,
    ...conditionalHeaders({ifMatch,ifNoneMatch})
   };
   const response=await checked('PUT',key,{headers,body:createReadStream(file),bodyHash},status=>status>=200&&status<300);
   return {etag:response.headers.get('etag'),sha256:bodyHash,size:info.size};
  },
  async get(key,{range}={}){
   validateKey(key);
   const headers={};
   if(range)headers.Range=validateRange(range);
   return checked('GET',key,{headers,allowGetRedirect:true},status=>status===200||status===206);
  },
  async head(key){
   validateKey(key);
   const response=await checked('HEAD',key,{},status=>status>=200&&status<300);
   return {etag:response.headers.get('etag'),size:parseSize(response.headers.get('content-length'))};
  },
  async remove(key){
   validateKey(key);
   const response=await request('DELETE',key);
   if(response.status===404)return {deleted:false};
   if(response.status>=200&&response.status<300)return {deleted:true};
   throw upstreamError(response);
  }
 };
}

function sign({method,url,headers,bodyHash,accessKeyId,secretAccessKey,now}){
 const amzDate=toAmzDate(now);
 const dateStamp=amzDate.slice(0,8);
 const allHeaders=new Headers(headers);
 allHeaders.set('host',url.host);
 allHeaders.set('x-amz-content-sha256',bodyHash);
 allHeaders.set('x-amz-date',amzDate);
 const canonicalHeaders=[];
 for(const [name,value] of allHeaders.entries())canonicalHeaders.push([name.toLowerCase(),normalizeHeaderValue(value)]);
 canonicalHeaders.sort(([a],[b])=>a.localeCompare(b));
 const signedHeaders=canonicalHeaders.map(([name])=>name).join(';');
 const canonicalRequest=[
  method,
  canonicalUri(url),
  canonicalQuery(url),
  canonicalHeaders.map(([name,value])=>`${name}:${value}\n`).join(''),
  signedHeaders,
  bodyHash
 ].join('\n');
 const scope=`${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
 const stringToSign=['AWS4-HMAC-SHA256',amzDate,scope,sha256Hex(canonicalRequest)].join('\n');
 const signature=hmac(signingKey(secretAccessKey,dateStamp),stringToSign,'hex');
 allHeaders.set('Authorization',`AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);
 return allHeaders;
}

function signingKey(secret,dateStamp){
 const kDate=hmac(`AWS4${secret}`,dateStamp);
 const kRegion=hmac(kDate,REGION);
 const kService=hmac(kRegion,SERVICE);
 return hmac(kService,'aws4_request');
}

function hmac(key,value,encoding){return createHmac('sha256',key).update(value,'utf8').digest(encoding);}
function sha256Hex(value){return createHash('sha256').update(value).digest('hex');}
function validateSha256(value){
 if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new HfStorageError('Invalid sha256',{status:400,code:'INVALID_SHA256'});
 return value;
}
async function sha256File(file){
 const hash=createHash('sha256');
 await new Promise((resolve,reject)=>{
  const stream=createReadStream(file);
  stream.on('data',chunk=>hash.update(chunk));
  stream.on('error',reject);
  stream.on('end',resolve);
 });
 return hash.digest('hex');
}

function parseBucket(bucket){
 if(typeof bucket!=='string')throw new HfStorageError('Bucket must be namespace/name',{status:400,code:'INVALID_BUCKET'});
 const parts=bucket.split('/');
 if(parts.length!==2||!parts[0]||!parts[1])throw new HfStorageError('Bucket must be namespace/name',{status:400,code:'INVALID_BUCKET'});
 for(const part of parts)if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(part)||part.endsWith('.'))throw new HfStorageError('Invalid bucket name',{status:400,code:'INVALID_BUCKET'});
 return {namespace:parts[0],bucketName:parts[1]};
}

function parseEndpoint(endpoint){
 let url;
 try{url=new URL(endpoint);}
 catch{throw new HfStorageError('Invalid storage endpoint',{status:400,code:'INVALID_ENDPOINT'});}
 if(url.username||url.password||url.search||url.hash)throw new HfStorageError('Invalid storage endpoint',{status:400,code:'INVALID_ENDPOINT'});
 const local=url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='::1';
 if(url.protocol==='http:'&&!local)throw new HfStorageError('Storage endpoint must use HTTPS',{status:400,code:'INVALID_ENDPOINT'});
 if(!local&&(url.protocol!=='https:'||url.hostname!=='s3.hf.co'))throw new HfStorageError('Storage endpoint must be the Hugging Face S3 gateway',{status:400,code:'INVALID_ENDPOINT'});
 return url;
}

function validateCredential(value,name){
 if(typeof value!=='string'||!value||/[\r\n\0]/.test(value))throw new HfStorageError(`Invalid ${name}`,{status:400,code:'INVALID_CREDENTIAL'});
}

function validateKey(key){
 if(typeof key!=='string'||!key)throw new HfStorageError('Invalid object key',{status:400,code:'INVALID_KEY'});
 if(/[\0\r\n\t\\]/.test(key)||key.startsWith('/')||key.endsWith('/')||key.includes('//')||key.startsWith('./')||key.includes('../')||key.endsWith('..'))throw new HfStorageError('Invalid object key',{status:400,code:'INVALID_KEY'});
 for(const part of key.split('/'))if(part==='.'||part==='..'||part==='')throw new HfStorageError('Invalid object key',{status:400,code:'INVALID_KEY'});
 return key;
}

function objectUrl(endpoint,namespace,bucket,key='',query){
 const url=new URL(endpoint.href);
 const base=url.pathname.replace(/\/+$/,'');
 const parts=[...base.split('/').filter(Boolean),namespace,bucket];
 if(key)parts.push(...key.split('/'));
 url.pathname='/'+parts.map(encodePathSegment).join('/');
 if(query)for(const [name,value] of Object.entries(query))url.searchParams.set(name,value);
 return url;
}

function encodePathSegment(value){return encodeURIComponent(value).replace(/[!'()*]/g,ch=>`%${ch.charCodeAt(0).toString(16).toUpperCase()}`);}
function canonicalUri(url){return url.pathname.split('/').map(part=>encodePathSegment(decodeURIComponent(part))).join('/');}
function canonicalQuery(url){
 return [...url.searchParams.entries()].sort(([a,av],[b,bv])=>a===b?av.localeCompare(bv):a.localeCompare(b)).map(([k,v])=>`${encodePathSegment(k)}=${encodePathSegment(v)}`).join('&');
}
function normalizeHeaderValue(value){return String(value).trim().replace(/\s+/g,' ');}
function toAmzDate(date){
 const d=date instanceof Date?date:new Date(date);
 if(Number.isNaN(d.getTime()))throw new HfStorageError('Invalid signing date',{status:500,code:'INVALID_DATE'});
 return d.toISOString().replace(/[:-]|\.\d{3}/g,'');
}
function conditionalHeaders({ifMatch,ifNoneMatch}){
 const headers={};
 if(ifMatch!==undefined)headers['If-Match']=validateEtag(ifMatch);
 if(ifNoneMatch!==undefined)headers['If-None-Match']=validateEtag(ifNoneMatch);
 return headers;
}
function validateEtag(value){
 if(typeof value!=='string'||!value||/[\r\n\0]/.test(value))throw new HfStorageError('Invalid ETag',{status:400,code:'INVALID_ETAG'});
 return value;
}
function validateRange(value){
 if(typeof value!=='string'||!/^bytes=\d*-\d*(,\d*-\d*)*$/.test(value))throw new HfStorageError('Invalid Range',{status:400,code:'INVALID_RANGE'});
 return value;
}
function parseSize(value){
 if(value===null)return undefined;
 const size=Number(value);
 return Number.isSafeInteger(size)&&size>=0?size:undefined;
}
function timeoutSignal(timeoutMs){
 if(!timeoutMs)return undefined;
 if(AbortSignal.timeout)return AbortSignal.timeout(timeoutMs);
 const controller=new AbortController();
 setTimeout(()=>controller.abort(),timeoutMs).unref?.();
 return controller.signal;
}
function isRedirect(status){return status===301||status===302||status===303||status===307||status===308;}
function validateDownloadRedirect(location){
 if(!location)throw new HfStorageError('Missing storage redirect location',{status:502,code:'UPSTREAM_REDIRECT'});
 let url;
 try{url=new URL(location);}
 catch{throw new HfStorageError('Invalid storage redirect',{status:502,code:'UPSTREAM_REDIRECT'});}
 const host=url.hostname.toLowerCase();
 const trusted=host==='cdn-lfs.hf.co'||host.endsWith('.hf.co')||host==='huggingface.co'||host.endsWith('.huggingface.co');
 if(url.protocol!=='https:'||!trusted)throw new HfStorageError('Untrusted storage redirect',{status:502,code:'UPSTREAM_REDIRECT'});
 return url;
}
function fetchFailure(error){
 if(error?.name==='AbortError'||error?.name==='TimeoutError')return new HfStorageError('Storage request timed out',{status:504,code:'UPSTREAM_TIMEOUT'});
 return new HfStorageError('Storage request failed',{status:502,code:'UPSTREAM_UNAVAILABLE'});
}
function upstreamError(response){
 const code=response.status===404?'NOT_FOUND':response.status===409||response.status===412?'PRECONDITION_FAILED':'UPSTREAM_ERROR';
 return new HfStorageError('Storage request rejected',{status:response.status,code});
}

