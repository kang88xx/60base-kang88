import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {createAppleTokenStore,appleTokenStoreFromEnv} from '../server/apple-tokens.mjs';
const directory=mkdtempSync(path.join(tmpdir(),'apple-tokens-')),store=openDatabase(directory);
const {privateKey:clientKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const signingKey=clientKey.export({type:'pkcs8',format:'pem'}),clientId='kr.60base.app',now=Date.now(),rawNonce='test-raw-nonce';
const identity={uid:'firebase-uid',appleSubject:'apple-subject',registration:{provider:'apple.com'}};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
let overrides={},badSignature=false,status=200,calls=[],passed=0;
function jwt(){const input=`${encode({alg:'RS256',kid:'key'})}.${encode({iss:'https://appleid.apple.com',aud:clientId,sub:identity.appleSubject,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600,nonce:createHash('sha256').update(rawNonce).digest('hex'),...overrides})}`;return `${input}.${(badSignature?randomBytes(256):sign('RSA-SHA256',Buffer.from(input),privateKey)).toString('base64url')}`;}
const service=createAppleTokenStore({store,teamId:'team',keyId:'client-key',clientId,privateKey:signingKey,now:()=>now,fetchImpl:async(url,options)=>{
 calls.push({url,options});assert.equal(options.redirect,'error');assert.ok(options.signal);
 if(url.endsWith('/keys'))return Response.json({keys:[{...publicKey.export({format:'jwk'}),kid:'key',alg:'RS256',use:'sig'}]});
 if(url.endsWith('/revoke'))return new Response('',{status});
 assert.equal(options.body.get('code').startsWith('code-'),true);
 assert.equal(options.body.get('client_id'),clientId);
 return Response.json({refresh_token:'secret-refresh-token',id_token:jwt()},{status});
}});
async function check(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
try{
 await check('explicit missing credentials leave service disabled',async()=>assert.equal(appleTokenStoreFromEnv({store,env:{}}),null));
 await check('verified Apple authorization stored encrypted by immutable Firebase UID',async()=>{
  assert.deepEqual(await service.capture({identity,authorizationCode:'code-valid',rawNonce}),{stored:true});
  const row=store.one('SELECT * FROM apple_refresh_tokens WHERE firebaseUid=?',identity.uid);
  assert.ok(row);assert.equal(row.tokenCiphertext.includes('secret-refresh-token'),false);
  assert.equal(store.unseal(row.tokenCiphertext).refreshToken,'secret-refresh-token');
 });
 await check('retry same authorization and returning session do not re-exchange one-use code',async()=>{
  const count=calls.length;await service.capture({identity,authorizationCode:'code-valid',rawNonce});await service.capture({identity});assert.equal(calls.length,count);
 });
 for(const [name,claims] of [['subject',{sub:'different-person'}],['audience',{aud:'other-app'}],['nonce',{nonce:'bad'}],['issuer',{iss:'https://attacker.test'}],['expiry',{exp:0}]]){
  await check(`reject ${name} mismatch without changing saved credential`,async()=>{
   overrides=claims;const old=store.one('SELECT tokenCiphertext FROM apple_refresh_tokens WHERE firebaseUid=?',identity.uid).tokenCiphertext;
   await assert.rejects(service.capture({identity,authorizationCode:'code-'+name,rawNonce}),{code:'APPLE_TOKEN_BINDING_MISMATCH'});
   assert.equal(store.one('SELECT tokenCiphertext FROM apple_refresh_tokens WHERE firebaseUid=?',identity.uid).tokenCiphertext,old);overrides={};
  });
 }
 await check('forged Apple signature rejected',async()=>{badSignature=true;await assert.rejects(service.capture({identity,authorizationCode:'code-forged',rawNonce}),{code:'APPLE_TOKEN_INVALID'});badSignature=false;});
 await check('Google and changed subject cannot use stored Apple credential',async()=>{
  await assert.rejects(service.capture({identity:{...identity,registration:{provider:'google.com'}}}),{code:'APPLE_AUTHORIZATION_REQUIRED'});
  await assert.rejects(service.capture({identity:{...identity,appleSubject:'other'}}),{code:'APPLE_STORED_IDENTITY_MISMATCH'});
 });
 await check('revocation uses stored secret and preserves retry evidence',async()=>{
  assert.deepEqual(await service.revoke({uid:identity.uid}),{revoked:true});assert.equal(calls.at(-1).options.body.get('token'),'secret-refresh-token');
  assert.ok(store.one('SELECT * FROM apple_refresh_tokens WHERE firebaseUid=?',identity.uid));
 });
 await check('revocation failures and missing credentials block completion',async()=>{
  status=400;await assert.rejects(service.revoke({uid:identity.uid}),{code:'APPLE_REVOCATION_FAILED'});status=200;
  await assert.rejects(service.revoke({uid:'other'}),{code:'APPLE_REVOCATION_TOKEN_MISSING'});
 });
 await check('ciphertext moved to another UID cannot revoke original user',async()=>{
  const original=store.one('SELECT * FROM apple_refresh_tokens WHERE firebaseUid=?',identity.uid);
  store.run('INSERT INTO apple_refresh_tokens VALUES(?,?,?,?,?)','attacker-uid',clientId,identity.appleSubject,original.tokenCiphertext,original.updatedAt);
  await assert.rejects(service.revoke({uid:'attacker-uid'}),{code:'APPLE_STORED_IDENTITY_MISMATCH'});
 });
 console.log(JSON.stringify({status:'passed',passed}));
}finally{store.db.close();rmSync(directory,{recursive:true,force:true});}
