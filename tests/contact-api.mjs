import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import test from 'node:test';
import contact from '../api/contact.js';

const valid = () => ({name:'Example team',email:'reply@example.test',message:'Please quote kitchen footage.',dataType:'First-person',requestId:randomUUID(),website:''});
let ip=0;
async function request(body=valid(), options={}) {
  const req=Readable.from(options.chunks || []);
  Object.assign(req,{method:options.method||'POST',headers:{origin:'https://60base.kr',host:'60base.kr','content-type':'application/json','x-forwarded-for':`192.0.2.${++ip}`,...options.headers}});
  if(!options.chunks)req.body=body;
  const headers={};let result,status;
  await contact(req,{setHeader:(name,value)=>headers[name]=value,end:text=>{result=JSON.parse(text);},get statusCode(){return this.code;},set statusCode(value){this.code=value;status=value;}});
  return {status,headers,body:result};
}
const originalFetch=globalThis.fetch;
const originalEnv={RESEND_API_KEY:process.env.RESEND_API_KEY,CONTACT_FROM:process.env.CONTACT_FROM};
process.env.RESEND_API_KEY='re_test_placeholder';process.env.CONTACT_FROM='Contact <contact@example.test>';
let calls=[];
const accepted=async(url,init)=>{calls.push({url,...init});return {ok:true,json:async()=>({id:'test-message-id'})};};
globalThis.fetch=accepted;
test.after(()=>{globalThis.fetch=originalFetch;for(const [key,value]of Object.entries(originalEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

test('method, origin, and media type reject before transport',async()=>{
  assert.equal((await request(valid(),{method:'GET'})).status,405);
  assert.equal((await request(valid(),{headers:{origin:'https://other.example'}})).status,403);
  assert.equal((await request(valid(),{headers:{'content-type':'text/plain'}})).status,415);
  assert.equal(calls.length,0);
});
test('new and legacy production origins accept; HTTP and lookalikes reject',async()=>{
  for(const origin of ['https://60base.ai','https://60base.kr']) assert.equal((await request(valid(),{headers:{origin}})).status,200);
  for(const origin of ['http://60base.ai','http://60base.kr','https://60base.ai.evil.test','https://60base.kr.evil.test','https://60base.ai:444','null',undefined]) assert.equal((await request(valid(),{headers:{origin}})).status,403);
});
test('malformed JSON and oversized parsed or streamed bodies reject',async()=>{
  assert.equal((await request('{bad')).status,400);
  assert.equal((await request({...valid(),message:'x'.repeat(25000)})).status,413);
  assert.equal((await request(undefined,{chunks:['x'.repeat(25000)]})).status,413);
  assert.equal((await request(valid(),{headers:{'content-length':'25000'}})).status,413);
});
test('required values, header injection, bounds, request ID and honeypot reject',async()=>{
  for(const patch of [{name:''},{email:'invalid'},{message:''},{name:'x\r\nBcc: attacker@example.test'},{email:'a@example.test\nBcc: x@example.test'},{dataType:'x\nHeader: x'},{name:'x'.repeat(101)},{message:'x'.repeat(5001)},{dataType:'x'.repeat(181)},{message:'x\0y'},{requestId:'invalid'},{website:'https://spam.example'},{name:2}]){
    const result=await request({...valid(),...patch});assert.equal(result.status,400,JSON.stringify(patch));
  }
});
test('missing configuration returns generic unavailable response',async()=>{
  const key=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;
  try{const result=await request();assert.equal(result.status,503);assert.deepEqual(result.body,{ok:false,error:'mail_unavailable'});}finally{process.env.RESEND_API_KEY=key;}
});
test('accepted message uses fixed recipient, visitor reply-to and server sender',async()=>{
  calls=[];const body={...valid(),to:'attacker@example.test',from:'attacker@example.test'};
  const result=await request(body);assert.equal(result.status,200);assert.deepEqual(result.body,{ok:true});
  const payload=JSON.parse(calls[0].body);assert.deepEqual(payload.to,['60base.ai@gmail.com']);assert.equal(payload.reply_to,body.email);assert.equal(payload.from,process.env.CONTACT_FROM);
  assert.match(payload.text,/Please quote kitchen footage/);assert.equal(calls[0].url,'https://api.resend.com/emails');
  assert.match(calls[0].headers['Idempotency-Key'],/^contact-[a-f0-9]{64}$/);
  assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(JSON.stringify(result).includes('re_test_placeholder'),false);
});
test('repeat accepted request is cached; changed content gets a new provider key',async()=>{
  calls=[];const body=valid();await request(body);await request(body);assert.equal(calls.length,1);
  await request({...body,message:'Changed request'});assert.equal(calls.length,2);assert.notEqual(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
});
test('concurrent same request sends once and both callers receive acceptance',async()=>{
  calls=[];let release;globalThis.fetch=async(url,init)=>{calls.push({url,...init});await new Promise(resolve=>{release=resolve;});return {ok:true,json:async()=>({id:'accepted'})};};
  try{const body=valid();const first=request(body);while(!release)await new Promise(resolve=>setImmediate(resolve));const second=request(body);release();assert.deepEqual((await Promise.all([first,second])).map(r=>r.status),[200,200]);assert.equal(calls.length,1);}finally{globalThis.fetch=accepted;}
});
test('provider failure can retry with same idempotency key without leaking provider details',async()=>{
  calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,...init});return {ok:false,json:async()=>({error:'secret diagnostic'})};};
  try{const body=valid();const failed=await request(body);assert.equal(failed.status,502);assert.deepEqual(failed.body,{ok:false,error:'send_unconfirmed'});globalThis.fetch=accepted;assert.equal((await request(body)).status,200);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);}finally{globalThis.fetch=accepted;}
});
test('provider must return accepted ID; missing ID, parse failure and network failure remain unconfirmed',async()=>{
  try{for(const mock of [async()=>({ok:true,json:async()=>({})}),async()=>({ok:true,json:async()=>{throw Error('parse');}}),async()=>{throw Error('network');}]){globalThis.fetch=mock;assert.equal((await request()).status,502);}}finally{globalThis.fetch=accepted;}
});
test('sixth distinct send from same IP is rate limited before transport',async()=>{
  calls=[];const headers={'x-forwarded-for':'198.51.100.20'};
  for(let i=0;i<5;i++)assert.equal((await request(valid(),{headers})).status,200);
  const result=await request(valid(),{headers});assert.equal(result.status,429);assert.equal(result.headers['Retry-After'],'900');assert.equal(calls.length,5);
});
