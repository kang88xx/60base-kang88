import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {createFirebaseEraser,createAppleRevoker} from '../server/firebase-erasure.mjs';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const serviceAccount={project_id:'test-project',client_email:'eraser@test-project.iam.gserviceaccount.com',private_key:keys.privateKey.export({type:'pkcs8',format:'pem'})};
function fixture({apple=false,failDelete=false,subcollection=false,missing=false}={}){
 let account=missing?null:{localId:'uid-1',providerUserInfo:[{providerId:apple?'apple.com':'google.com'}]},registration=true,marker=false,evidence={},deletes=0;
 const calls=[];
 const fetchImpl=async(url,options={})=>{
  calls.push({url,method:options.method});const ok=(value={},status=200)=>new Response(JSON.stringify(value),{status});
  if(url==='https://oauth2.googleapis.com/token'){
   const jwt=options.body.get('assertion').split('.');assert.ok(verify('RSA-SHA256',Buffer.from(jwt.slice(0,2).join('.')),keys.publicKey,Buffer.from(jwt[2],'base64url')));return ok({access_token:'test-token'});
  }
  assert.equal(options.headers.Authorization,'Bearer test-token');
  if(url.endsWith('accounts:lookup'))return ok(account?{users:[account]}:{});
  if(url.includes('/account_deletions/')){marker=true;return ok();}
  if(url.endsWith('accounts:delete')){assert.ok(marker);if(failDelete)return ok({},503);account=null;deletes++;return ok();}
  if(url.endsWith(':listCollectionIds'))return ok({collectionIds:subcollection?['unexpected']:[]});
  if(url.endsWith('/registrations/uid-1')){if(options.method==='DELETE'){assert.equal(account,null);registration=false;return ok();}return ok({},registration?200:404);}
  throw Error(`Unexpected ${url}`);
 };
 return {fetchImpl,calls,saveEvidence:async value=>{evidence=structuredClone(value);},get evidence(){return evidence;},get deletes(){return deletes;}};
}
assert.throws(()=>createFirebaseEraser({}),{code:'ERASER_NOT_CONFIGURED'});
for(const scenario of [{},{failDelete:true},{apple:true},{subcollection:true},{missing:true}]){
 const mock=fixture(scenario),eraser=createFirebaseEraser({projectId:'test-project',serviceAccount,fetchImpl:mock.fetchImpl});
 const args={identities:[{provider:'firebase',uid:'uid-1'}],saveEvidence:mock.saveEvidence};
 if(scenario.apple){await assert.rejects(eraser.preflight(args),{code:'APPLE_REVOCATION_NOT_CONFIGURED'});assert.equal(mock.calls.some(call=>call.method==='PATCH'||call.url.endsWith('accounts:delete')),false);}
 if(Object.keys(scenario).length){await assert.rejects(eraser.erase(args),{code:scenario.apple?'APPLE_REVOCATION_NOT_CONFIGURED':scenario.subcollection?'FIRESTORE_SUBCOLLECTION_REVIEW_REQUIRED':scenario.missing?'IDENTITY_PROVIDER_HISTORY_MISSING':'FIREBASE_ERASURE_FAILED'});assert.notEqual(mock.evidence.complete,true);}
 else{const result=await eraser.erase(args);assert.equal(result.complete,true);assert.equal(result.firebase['uid-1'].authDeleted,true);assert.equal(result.firebase['uid-1'].firestoreDeleted,true);const again=await eraser.erase({...args,previousEvidence:mock.evidence});assert.equal(again.complete,true);assert.equal(mock.deletes,1);}
}
const apple=fixture({apple:true});let revoked=0;const adapter=createFirebaseEraser({projectId:'test-project',serviceAccount,fetchImpl:apple.fetchImpl,appleRevoker:Object.assign(async({uid})=>{assert.equal(uid,'uid-1');revoked++;return {revoked:true};},{preflight:async()=>{}})});assert.equal((await adapter.erase({identities:[{provider:'firebase',uid:'uid-1'}],saveEvidence:apple.saveEvidence})).complete,true);assert.equal(revoked,1);
const revoker=createAppleRevoker({clientId:'test-client',clientSecret:'server-secret',loadRefreshToken:async uid=>uid==='uid-1'?'server-token':null,fetchImpl:async(url,options)=>{assert.equal(url,'https://appleid.apple.com/auth/revoke');assert.equal(options.body.get('token'),'server-token');assert.equal(options.body.get('token_type_hint'),'refresh_token');return new Response('',{status:200});}});
assert.deepEqual(await revoker({uid:'uid-1'}),{revoked:true});await assert.rejects(revoker({uid:'other'}),{code:'APPLE_REVOCATION_TOKEN_MISSING'});
console.log('firebase erasure passed: signed OAuth exchange, exact UID, fresh Auth/Firestore checks, replay marker, restart retry, API failure, unknown history, unexpected subcollections, Apple revocation gate and token-bound HTTP call');
