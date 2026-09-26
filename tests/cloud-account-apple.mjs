import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the real account state machine with a deterministic Firebase boundary.
// Live OAuth and native credentials still require configured provider/device checks.
const source=await readFile(new URL('../studio/cloud-account.js',import.meta.url),'utf8');
let serial=0;
async function account({appleEnabled=true,providerId='apple.com',verified=true,name='',claimProvider=providerId,native=true,platform='ios'}={}){
 globalThis.Capacitor=native?{isNativePlatform:()=>true,getPlatform:()=>platform}:undefined;
 const auth={currentUser:null}, documents=new Map(), calls=[];
 let callback;
 const user={uid:`identity-${++serial}`,email:providerId==='apple.com'?'private@privaterelay.appleid.com':'google@example.test',emailVerified:verified,displayName:name,providerData:[{providerId}]};
 class Provider{constructor(id='google.com'){this.providerId=id;}credential(value){return value;}static credential(idToken){return {idToken};}addScope(scope){calls.push(scope);}setCustomParameters(){}}
 globalThis.__appleAccountTest={config:{apiKey:'test',authDomain:'test',projectId:'demo-test',appId:'test',appleEnabled},native:{signInNative:async provider=>{calls.push(provider);return {idToken:'apple-id-token',authorizationCode:'apple-code',rawNonce:'raw-nonce'};},nativeSignOut:async()=>{}},sdk:{
  initializeApp:()=>({}),getAuth:()=>auth,initializeAuth:()=>auth,getFirestore:()=>({}),GoogleAuthProvider:Provider,OAuthProvider:Provider,
  setPersistence:async()=>{},onAuthStateChanged:(_auth,fn)=>{callback=fn;queueMicrotask(()=>fn(null));return()=>{};},
  signInWithCredential:async(_auth,credential)=>{assert.equal(credential.idToken,'apple-id-token');auth.currentUser=user;await callback(user);return {user};},
  signInWithPopup:async(_auth,provider)=>{calls.push(provider.providerId);auth.currentUser=user;return {user};},
  doc:(_db,_collection,uid)=>uid,getDocFromServer:async uid=>({exists:()=>documents.has(uid),data:()=>documents.get(uid)}),
  getIdTokenResult:async()=>({claims:{email:user.email,email_verified:verified,firebase:{sign_in_provider:claimProvider}}}),
  runTransaction:async(_db,fn)=>fn({get:async uid=>({exists:()=>documents.has(uid),data:()=>documents.get(uid)}),set:(uid,value)=>documents.set(uid,value)}),
  serverTimestamp:()=>({toMillis:()=>12345}),signOut:async()=>{auth.currentUser=null;await callback(null);},getIdToken:async()=>'firebase-token'
 }};
 const code=source.replace("import { firebaseConfig } from './firebase-config.js';",'const firebaseConfig=globalThis.__appleAccountTest.config;')
 .replaceAll("import('../app/native.js')",'Promise.resolve(globalThis.__appleAccountTest.native)')
 .replace(/const modules = await Promise\.all\(\[[\s\S]*?\]\);/,'const modules = [globalThis.__appleAccountTest.sdk];');
 const module=await import(`data:text/javascript;base64,${Buffer.from(code+'\n//'+serial).toString('base64')}`);
 await module.cloudAccountReady;
 return {module,documents,calls,user};
}
let passed=0;
async function check(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
await check('Apple is disabled unless explicitly configured',async()=>{
 const {module,calls}=await account({appleEnabled:false});
 await assert.rejects(module.continueWithApple(),{code:'cloud/apple-unconfigured'});
 assert.equal(calls.length,0);assert.equal(module.getCloudAccount().phase,'signedOut');
});
await check('Apple is not offered on Android or web without a supported code exchange',async()=>{
 for(const options of [{native:true,platform:'android'},{native:false}]){const {module,calls}=await account(options);await assert.rejects(module.continueWithApple(),{code:'cloud/apple-unconfigured'});assert.equal(calls.length,0);}
});
await check('Apple requests name/email and requires explicit missing name and consents',async()=>{
 const {module,calls,documents}=await account();
 await module.continueWithApple();assert.deepEqual(calls,['email','name','apple.com']);
 assert.equal(module.getCloudAccount().phase,'registrationRequired');
 await assert.rejects(module.completeRegistration({adult:true,terms:true,privacy:true}),{code:'cloud/invalid-name'});
 await assert.rejects(module.completeRegistration({displayName:'Apple 사용자',adult:false,terms:true,privacy:true}),{code:'cloud/consent-required'});
 await module.completeRegistration({displayName:'Apple 사용자',adult:true,terms:true,privacy:true});
 const saved=module.getCloudAccount().registration;
 assert.equal(saved.provider,'apple.com');assert.equal(saved.email,'private@privaterelay.appleid.com');
 assert.equal(saved.termsVersion,'2026-09-18-apple-v1');assert.equal(documents.size,1);
 await module.retryCloudAccount();assert.deepEqual(module.getCloudAccount().registration,saved);
 await module.signOutCloudAccount();assert.equal(module.getCloudAccount().registration,null);
});
await check('Google registration preserves legacy consent version',async()=>{
 const {module}=await account({providerId:'google.com',name:'Google 사용자',native:false});
 await module.continueWithGoogle();await module.completeRegistration({adult:true,terms:true,privacy:true});
 assert.equal(module.getCloudAccount().registration.termsVersion,'2026-09-14-google-v1');
});
await check('Apple registration rejects token provider mismatch without writes',async()=>{
 const {module,documents}=await account({claimProvider:'google.com',name:'User'});
 await module.continueWithApple();
 await assert.rejects(module.completeRegistration({adult:true,terms:true,privacy:true}),{code:'cloud/google-identity-required'});
 assert.equal(documents.size,0);
});
await check('unverified Apple identity cannot register',async()=>{
 const {module,documents}=await account({verified:false});await module.continueWithApple();
 assert.equal(module.getCloudAccount().user,null);assert.equal(documents.size,0);
});
await check('native Apple authorization remains ephemeral and clears after bridge or sign-out',async()=>{
 const {module}=await account({native:true,name:'Apple 사용자'});await module.continueWithApple();
 assert.deepEqual(module.getCloudAppleAuthorization(),{authorizationCode:'apple-code',rawNonce:'raw-nonce'});
 module.clearCloudAppleAuthorization();assert.equal(module.getCloudAppleAuthorization(),null);
 await module.signOutCloudAccount();await module.continueWithApple();
 assert.ok(module.getCloudAppleAuthorization());await module.signOutCloudAccount();assert.equal(module.getCloudAppleAuthorization(),null);
});
delete globalThis.Capacitor;
delete globalThis.__appleAccountTest;
console.log(JSON.stringify({status:'passed',passed}));
