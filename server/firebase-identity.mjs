import {createPublicKey, verify as verifySignature} from 'node:crypto';

const CERTS_URL='https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const FIRESTORE_ROOT='https://firestore.googleapis.com/v1';
const consentVersion=provider=>provider==='apple.com'?'2026-09-18-apple-v1':'2026-09-14-google-v1';
const MAX_TOKEN_SIZE=8192;
const MAX_CLOCK_SKEW_SECONDS=300;
const DEFAULT_TIMEOUT_MS=5000;
const REQUIRED_REGISTRATION_KEYS=[
 'schemaVersion','provider','email','emailVerified','displayName','adultDeclared',
 'termsVersion','privacyVersion','termsAcceptedAt','privacyAcknowledgedAt','createdAt','updatedAt','source'
];
const TIMESTAMP_KEYS=['termsAcceptedAt','privacyAcknowledgedAt','createdAt','updatedAt'];

export class FirebaseIdentityError extends Error{
 constructor(status,message='Authentication failed',code='FIREBASE_IDENTITY_ERROR'){
  super(message);
  this.name='FirebaseIdentityError';
  this.status=status;
  this.code=code;
 }
}

export function createFirebaseVerifier({projectId,fetchImpl=globalThis.fetch,now=Date.now,timeoutMs=DEFAULT_TIMEOUT_MS}={}){
 if(typeof projectId!=='string'||!/^[A-Za-z0-9-]{3,64}$/.test(projectId))throw new FirebaseIdentityError(503,'Identity verifier is not configured','CONFIGURATION_ERROR');
 if(typeof fetchImpl!=='function')throw new FirebaseIdentityError(503,'Identity verifier is not configured','FETCH_UNAVAILABLE');
 let certsCache=null;

 async function verify(idToken){
  try{
   const token=parseJwt(idToken);
   validateClaims(token.header,token.payload,projectId,now());
   const certs=await getCerts();
   const cert=certs[token.header.kid];
   if(typeof cert!=='string'||!cert.trim())throw unauthorized();
   const key=createPublicKey(cert);
   const ok=verifySignature('RSA-SHA256',Buffer.from(token.signingInput),key,token.signature);
   if(!ok)throw unauthorized();
   const registration=await readRegistration({projectId,uid:token.payload.sub,idToken,fetchImpl,timeoutMs});
   const normalized=normalizeRegistration(registration,token.payload,projectId);
   return Object.freeze({
    uid:token.payload.sub,
    email:token.payload.email,
    name:safeName(token.payload.name)||normalized.displayName,
    registration:normalized,
    ...(normalized.provider==='apple.com'?{appleSubject:token.payload.firebase.identities['apple.com'][0]}:{})
   });
  }catch(error){
   if(error instanceof FirebaseIdentityError)throw error;
   throw unauthorized();
  }
 }

 async function getCerts(){
  if(certsCache&&now()<certsCache.expiresAt)return certsCache.value;
  let response;
  try{
   response=await fetchImpl(CERTS_URL,{method:'GET',redirect:'error',signal:timeoutSignal(timeoutMs)});
  }catch{
   throw unavailable();
  }
  if(!response||response.status!==200)throw unavailable();
  let body;
  try{body=await response.json();}
  catch{throw unavailable();}
  if(!body||typeof body!=='object'||Array.isArray(body))throw unavailable();
  const certs=Object.freeze({...body});
  certsCache={value:certs,expiresAt:now()+cacheMaxAgeMs(response.headers)};
  return certs;
 }

 return verify;
}

function parseJwt(idToken){
 if(typeof idToken!=='string'||idToken.length<20||idToken.length>MAX_TOKEN_SIZE)throw unauthorized();
 if(/[\s\0]/.test(idToken))throw unauthorized();
 const parts=idToken.split('.');
 if(parts.length!==3||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))throw unauthorized();
 let header,payload,signature;
 try{
  header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
  payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  signature=Buffer.from(parts[2],'base64url');
 }catch{
  throw unauthorized();
 }
 if(!header||typeof header!=='object'||!payload||typeof payload!=='object'||!signature.length)throw unauthorized();
 return {header,payload,signature,signingInput:`${parts[0]}.${parts[1]}`};
}

function validateClaims(header,payload,projectId,nowMs){
 const nowSeconds=Math.floor(nowMs/1000);
 if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid)throw unauthorized();
 if(payload.aud!==projectId||payload.iss!==`https://securetoken.google.com/${projectId}`)throw unauthorized();
 if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>128)throw unauthorized();
 if(!Number.isFinite(payload.exp)||payload.exp<=nowSeconds)throw unauthorized();
 if(!Number.isFinite(payload.iat)||payload.iat>nowSeconds+MAX_CLOCK_SKEW_SECONDS)throw unauthorized();
 if(!Number.isFinite(payload.auth_time)||payload.auth_time>nowSeconds+MAX_CLOCK_SKEW_SECONDS)throw unauthorized();
 if(typeof payload.email!=='string'||!payload.email||payload.email.length>254)throw unauthorized();
 if(payload.email_verified!==true)throw forbidden();
 if(!['google.com','apple.com'].includes(payload.firebase?.sign_in_provider))throw forbidden();
 if(payload.firebase.sign_in_provider==='apple.com'){
  const subjects=payload.firebase.identities?.['apple.com'];
  if(!Array.isArray(subjects)||subjects.length!==1||typeof subjects[0]!=='string'||!subjects[0]||subjects[0].length>255)throw forbidden();
 }
}

async function readRegistration({projectId,uid,idToken,fetchImpl,timeoutMs}){
 const path=`projects/${encodeURIComponent(projectId)}/databases/(default)/documents/registrations/${encodeURIComponent(uid)}`;
 const url=`${FIRESTORE_ROOT}/${path}`;
 let response;
 try{
  response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${idToken}`},signal:timeoutSignal(timeoutMs)});
 }catch{
  throw unavailable();
 }
 if(response.status===401)throw unauthorized();
 if(response.status===403||response.status===404)throw forbidden();
 if(response.status!==200)throw unavailable();
 try{return await response.json();}
 catch{throw unavailable();}
}

function normalizeRegistration(document,payload,projectId){
 const fields=document?.fields;
 if(!fields||typeof fields!=='object'||Array.isArray(fields))throw forbidden();
 if(document.name!==`projects/${projectId}/databases/(default)/documents/registrations/${payload.sub}`)throw forbidden();
 const keys=Object.keys(fields);
 if(keys.length!==REQUIRED_REGISTRATION_KEYS.length||!REQUIRED_REGISTRATION_KEYS.every(key=>keys.includes(key)))throw forbidden();
 const value={
  schemaVersion:intValue(fields.schemaVersion),
  provider:stringValue(fields.provider),
  email:stringValue(fields.email),
  emailVerified:booleanValue(fields.emailVerified),
  displayName:stringValue(fields.displayName),
  adultDeclared:booleanValue(fields.adultDeclared),
  termsVersion:stringValue(fields.termsVersion),
  privacyVersion:stringValue(fields.privacyVersion),
  source:stringValue(fields.source)
 };
 const timestamps=Object.fromEntries(TIMESTAMP_KEYS.map(key=>[key,timestampValue(fields[key])]));
 if(value.schemaVersion!==1||value.provider!==payload.firebase.sign_in_provider||value.email!==payload.email||
   value.emailVerified!==true||value.adultDeclared!==true||value.termsVersion!==consentVersion(value.provider)||
   value.privacyVersion!==consentVersion(value.provider)||value.source!=='studio-web'||value.displayName.length<1||
   value.displayName.length>60)throw forbidden();
 return Object.freeze({...value,...timestamps});
}

function stringValue(field){
 if(!field||typeof field.stringValue!=='string')throw forbidden();
 return field.stringValue;
}
function booleanValue(field){
 if(!field||typeof field.booleanValue!=='boolean')throw forbidden();
 return field.booleanValue;
}
function intValue(field){
 const value=field?.integerValue;
 if(typeof value!=='string'||!/^-?\d+$/.test(value))throw forbidden();
 const number=Number(value);
 if(!Number.isSafeInteger(number))throw forbidden();
 return number;
}
function timestampValue(field){
 const value=field?.timestampValue;
 if(typeof value!=='string')throw forbidden();
 const time=Date.parse(value);
 if(!Number.isFinite(time))throw forbidden();
 return time;
}
function safeName(value){
 return typeof value==='string'?value.slice(0,60):'';
}
function cacheMaxAgeMs(headers){
 const header=headers?.get?.('cache-control')||'';
 const match=/(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/i.exec(header);
 const seconds=match?Number(match[1]):300;
 return Math.max(1,Math.min(seconds,86400))*1000;
}
function timeoutSignal(timeoutMs){
 if(!timeoutMs)return undefined;
 if(AbortSignal.timeout)return AbortSignal.timeout(timeoutMs);
 const controller=new AbortController();
 setTimeout(()=>controller.abort(),timeoutMs).unref?.();
 return controller.signal;
}
function unauthorized(){return new FirebaseIdentityError(401,'Authentication failed','UNAUTHORIZED');}
function forbidden(){return new FirebaseIdentityError(403,'Registration is not authorized','FORBIDDEN');}
function unavailable(){return new FirebaseIdentityError(503,'Identity service unavailable','UNAVAILABLE');}
