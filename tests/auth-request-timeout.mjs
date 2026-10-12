import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(process.env.AUTH_REQUEST_SOURCE || new URL('../studio/online-api.js',import.meta.url),'utf8');
const originalFetch=globalThis.fetch,originalWindow=globalThis.window,originalTimeout=globalThis.setTimeout;
const initial={online:true,user:null,csrf:null,settings:{}};
const response=(body=initial,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
let serial=0;
async function fixture({native=false,request=async()=>response()}={}){
 globalThis.window=new EventTarget();
 globalThis.__authRequestTest={isNativeApp:()=>native,nativeApiRequest:request};
 globalThis.fetch=request;
 const code=source.replace("import { isNativeApp, nativeApiRequest } from '../app/native.js';",'const {isNativeApp,nativeApiRequest}=globalThis.__authRequestTest;');
 return import(`data:text/javascript;base64,${Buffer.from(code+'\n//'+(++serial)).toString('base64')}`);
}
async function bounded(promise){
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=originalTimeout(()=>reject(Error('Authentication wait never settled')),500);})]);}
 finally{clearTimeout(timer);}
}
// Keep the production deadline, accelerating only that timer for deterministic probes.
globalThis.setTimeout=(fn,ms,...args)=>originalTimeout(fn,ms===15000?25:ms,...args);
try{
 for(const native of [false,true]){
  const module=await fixture({native,request:()=>new Promise(()=>{})});
  await bounded(module.sessionReady);
  assert.equal(module.session.online,false,'initial session failure releases the login entry');
  assert.equal(module.session.user,null);
 }
 console.log('PASS browser/native stalled initial sessions settle without granting access');

 let calls=0,lateResolve;
 const module=await fixture({native:true,request:async(path)=>{
  calls++;
  if(path==='/api/session'&&calls===1)return response();
  return new Promise(resolve=>{lateResolve=resolve;});
 }});
 await module.sessionReady;
 await assert.rejects(bounded(module.api('/auth/login',{method:'POST',body:{email:'qa@example.test',password:'test'}})),{code:'service/request-timeout'});
 assert.equal(calls,2,'timed-out auth mutations are never automatically retried');
 lateResolve(response({online:true,user:{id:'late-user'}}));
 await new Promise(resolve=>originalTimeout(resolve,0));
 assert.equal(module.session.user,null,'late native result cannot open a member session');
 console.log('PASS timed-out native authentication releases busy state without retry or late identity adoption');

 const body=await fixture({request:async(path)=>path==='/api/session'?response():{ok:true,status:200,json:()=>new Promise(()=>{})}});
 await body.sessionReady;
 await assert.rejects(bounded(body.api('/auth/firebase',{method:'POST',body:{idToken:'fixture'}})),{code:'service/request-timeout'});
 console.log('PASS deadline includes a stalled JSON body');

 const controller=new AbortController();
 const pending=module.api('/auth/login',{method:'POST',signal:controller.signal});
 controller.abort();
 await assert.rejects(bounded(pending),{name:'AbortError'});
 const before=calls;
 await assert.rejects(module.api('/auth/login',{method:'POST',signal:controller.signal}),{name:'AbortError'});
 assert.equal(calls,before,'already cancelled work never reaches the native transport');
 console.log('PASS caller cancellation fences native transport and prevents dispatch when already aborted');

 const unavailable=await fixture({request:async()=>response({error:'service unavailable'},503)});
 await unavailable.sessionReady;
 await assert.rejects(unavailable.api('/auth/login',{method:'POST'}),{status:503,message:'service unavailable'});
 assert.equal(unavailable.session.user,null);
 console.log('PASS service errors retain status and fail closed');
}finally{
 globalThis.fetch=originalFetch;globalThis.window=originalWindow;globalThis.setTimeout=originalTimeout;
 delete globalThis.__authRequestTest;
}
