import assert from 'node:assert/strict';
import {generateKeyPairSync,sign as signData} from 'node:crypto';
import {createFirebaseVerifier,FirebaseIdentityError} from '../server/firebase-identity.mjs';

const projectId='demo-dongjakso-signup';
const kid='kid-1';
const fixedNow=Date.parse('2026-09-17T00:00:00Z');
const nowSeconds=Math.floor(fixedNow/1000);
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const publicCert=publicKey.export({type:'spki',format:'pem'});
let passed=0;

function encode(value){return Buffer.from(JSON.stringify(value)).toString('base64url');}
function token({header={},payload={},key=privateKey}={}){
 const h={alg:'RS256',kid,typ:'JWT',...header};
 const p={
  iss:`https://securetoken.google.com/${projectId}`,
  aud:projectId,
  sub:'uid-123',
  email:'member@example.test',
  email_verified:true,
  name:'Test Member',
  iat:nowSeconds-60,
  exp:nowSeconds+3600,
  auth_time:nowSeconds-120,
  firebase:{sign_in_provider:'google.com'},
  ...payload
 };
 const signingInput=`${encode(h)}.${encode(p)}`;
 const signature=signData('RSA-SHA256',Buffer.from(signingInput),key).toString('base64url');
 return `${signingInput}.${signature}`;
}
function registration(uid='uid-123',email='member@example.test',overrides={}){
 const data={
  schemaVersion:{integerValue:'1'},
  provider:{stringValue:'google.com'},
  email:{stringValue:email},
  emailVerified:{booleanValue:true},
  displayName:{stringValue:'Test Member'},
  adultDeclared:{booleanValue:true},
  termsVersion:{stringValue:'2026-09-14-google-v1'},
  privacyVersion:{stringValue:'2026-09-14-google-v1'},
  termsAcceptedAt:{timestampValue:'2026-09-14T00:00:00.000Z'},
  privacyAcknowledgedAt:{timestampValue:'2026-09-14T00:00:01.000Z'},
  createdAt:{timestampValue:'2026-09-14T00:00:02.000Z'},
  updatedAt:{timestampValue:'2026-09-14T00:00:03.000Z'},
  source:{stringValue:'studio-web'},
  ...overrides
 };
 return {name:`projects/${projectId}/databases/(default)/documents/registrations/${uid}`,fields:data};
}
function response(body,{status=200,headers={}}={}){
 return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
}
function makeFetch({certStatus=200,certHeaders={'cache-control':'public, max-age=30'},certBody={[kid]:publicCert},firestoreStatus=200,firestoreBody=registration(),record=[]}={}){
 return async (url,init={})=>{
  record.push({url:String(url),init});
  assert.equal(init.redirect,'error');
  if(String(url).includes('/robot/v1/metadata/x509/')){
   return response(certBody,{status:certStatus,headers:certHeaders});
  }
  assert.equal(init.headers.Authorization.startsWith('Bearer '),true);
  assert.equal(String(url),`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/registrations/uid-123`);
  return response(firestoreBody,{status:firestoreStatus});
 };
}
async function check(name,fn){
 await fn();
 passed+=1;
 console.log(`PASS ${name}`);
}
async function rejects(name,fn,status){
 await check(name,async ()=>{
  await assert.rejects(fn,error=>{
   assert.ok(error instanceof FirebaseIdentityError);
   assert.equal(error.status,status);
   assert.equal(error.message.includes('eyJ'),false);
   return true;
  });
 });
}

await check('valid signed Firebase token returns safe identity and registration fields',async ()=>{
 const calls=[];
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({record:calls}),now:()=>fixedNow});
 const result=await verify(token());
 assert.deepEqual(Object.keys(result).sort(),['email','name','registration','uid']);
 assert.equal(result.uid,'uid-123');
 assert.equal(result.email,'member@example.test');
 assert.equal(result.name,'Test Member');
 assert.equal(result.registration.displayName,'Test Member');
 assert.equal(result.registration.termsAcceptedAt,Date.parse('2026-09-14T00:00:00.000Z'));
 assert.equal(calls.length,2);
 assert.equal(calls[0].init.headers?.Authorization,undefined);
 assert.ok(calls[0].init.signal);
 assert.ok(calls[1].init.signal);
});

await rejects('forged signature is rejected',async ()=>{
 const {privateKey:otherKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch(),now:()=>fixedNow});
 await verify(token({key:otherKey}));
},401);

await rejects('expired token is rejected before Firestore',async ()=>{
 const calls=[];
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({record:calls}),now:()=>fixedNow});
 await verify(token({payload:{exp:nowSeconds-1}}));
},401);

await rejects('wrong audience is rejected',async ()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch(),now:()=>fixedNow});
 await verify(token({payload:{aud:'other-project'}}));
},401);

await rejects('non Google provider is forbidden',async ()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch(),now:()=>fixedNow});
 await verify(token({payload:{firebase:{sign_in_provider:'password'}}}));
},403);

await rejects('unverified email is forbidden',async ()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch(),now:()=>fixedNow});
 await verify(token({payload:{email_verified:false}}));
},403);

await rejects('missing registration is forbidden',async ()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({firestoreStatus:404}),now:()=>fixedNow});
 await verify(token());
},403);

await rejects('registration email mismatch is forbidden',async ()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({firestoreBody:registration('uid-123','other@example.test')}),now:()=>fixedNow});
 await verify(token());
},403);

await rejects('registration document id mismatch is forbidden',async ()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({firestoreBody:registration('other-uid','member@example.test')}),now:()=>fixedNow});
 await verify(token());
},403);

await rejects('registration requires typed Firestore timestamps',async ()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({firestoreBody:registration('uid-123','member@example.test',{createdAt:{stringValue:'2026-09-14'}})}),now:()=>fixedNow});
 await verify(token());
},403);

await check('certificate cache honors max-age TTL',async ()=>{
 const calls=[];
 let tick=fixedNow;
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({record:calls,certHeaders:{'cache-control':'public, max-age=2'}}),now:()=>tick});
 await verify(token());
 await verify(token());
 assert.equal(calls.filter(call=>call.url.includes('/x509/')).length,1);
 tick+=2001;
 await verify(token());
 assert.equal(calls.filter(call=>call.url.includes('/x509/')).length,2);
});

await rejects('payload tampering after signing is rejected',async ()=>{
 const original=token();
 const [header,payload,signature]=original.split('.');
 const tampered={...JSON.parse(Buffer.from(payload,'base64url').toString('utf8')),email:'attacker@example.test'};
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch(),now:()=>fixedNow});
 await verify(`${header}.${encode(tampered)}.${signature}`);
},401);

await rejects('cert endpoint failure is sanitized as unavailable',async ()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({certStatus:500}),now:()=>fixedNow});
 await verify(token());
},503);

await rejects('timeout or network failure is sanitized as unavailable',async ()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:async ()=>{throw new DOMException('timeout','TimeoutError');},now:()=>fixedNow});
 await verify(token());
},503);

await rejects('oversized token is rejected',async ()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch(),now:()=>fixedNow});
 await verify(`${'a'.repeat(9000)}.b.c`);
},401);

const appleEmail='private@privaterelay.appleid.com';
const appleFields={provider:{stringValue:'apple.com'},termsVersion:{stringValue:'2026-09-18-apple-v1'},privacyVersion:{stringValue:'2026-09-18-apple-v1'}};
const applePayload={email:appleEmail,name:undefined,firebase:{sign_in_provider:'apple.com',identities:{'apple.com':['apple-subject']}}};
await check('signed Apple token accepts private relay and registered name fallback',async()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({firestoreBody:registration('uid-123',appleEmail,appleFields)}),now:()=>fixedNow});
 const result=await verify(token({payload:applePayload}));
 assert.equal(result.registration.provider,'apple.com');
 assert.equal(result.email,appleEmail);
 assert.equal(result.name,'Test Member');
});
await rejects('Apple identity cannot claim Google registration',async()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({firestoreBody:registration('uid-123',appleEmail)}),now:()=>fixedNow});
 await verify(token({payload:applePayload}));
},403);
await rejects('unverified Apple token rejected',async()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({firestoreBody:registration('uid-123',appleEmail,appleFields)}),now:()=>fixedNow});
 await verify(token({payload:{...applePayload,email_verified:false}}));
},403);
await rejects('Apple consent must use Apple policy version',async()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({firestoreBody:registration('uid-123',appleEmail,{provider:{stringValue:'apple.com'}})}),now:()=>fixedNow});
 await verify(token({payload:applePayload}));
},403);
await rejects('Apple token requires signed provider subject binding',async()=>{
 const verify=createFirebaseVerifier({projectId,fetchImpl:makeFetch({firestoreBody:registration('uid-123',appleEmail,appleFields)}),now:()=>fixedNow});
 await verify(token({payload:{...applePayload,firebase:{sign_in_provider:'apple.com'}}}));
},403);
console.log(JSON.stringify({status:'passed',passed,scope:'Firebase ID token verifier without Admin credentials'}));
