import {sign} from 'node:crypto';
const blocked=code=>{throw Object.assign(new Error(code),{code});};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');

// Credentials are supplied by the server operator, never discovered from disk.
export function createFirebaseEraser({projectId,serviceAccount,fetchImpl=fetch,now=Date.now,appleRevoker=null}={}){
 if(!/^[a-zA-Z0-9-]{3,64}$/.test(projectId||'')||serviceAccount?.project_id!==projectId||!serviceAccount?.client_email||!serviceAccount?.private_key)blocked('ERASER_NOT_CONFIGURED');
 async function accessToken(){
  const issued=Math.floor(now()/1000),input=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:serviceAccount.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',aud:'https://oauth2.googleapis.com/token',iat:issued,exp:issued+3600})}`;
  const assertion=`${input}.${sign('RSA-SHA256',Buffer.from(input),serviceAccount.private_key).toString('base64url')}`;
  const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(response.status!==200)blocked('ERASER_TOKEN_FAILED');const result=await response.json();if(!result.access_token)blocked('ERASER_TOKEN_FAILED');return result.access_token;
 }
 async function erase({identities,previousEvidence={},saveEvidence,assertCurrent=async()=>{},preflightOnly=false}){
  if(identities.some(identity=>identity.provider!=='firebase'))blocked('UNKNOWN_IDENTITY_PROVIDER');
  const evidence=structuredClone(previousEvidence);evidence.firebase??={};
  if(!identities.length)return {...evidence,complete:true};
  const token=await accessToken();
  async function call(url,method='GET',body){await assertCurrent();const response=await fetchImpl(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});return response;}
  async function json(url,method,body){const response=await call(url,method,body);if(!response.ok)blocked('FIREBASE_ERASURE_FAILED');return response.json();}
  const auth=`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`;
  for(const {uid} of identities){
   if(typeof uid!=='string'||!uid||uid.includes('/'))blocked('INVALID_IDENTITY_UID');
   const state=evidence.firebase[uid]??={};
   const lookup=async()=>{const result=await json(`${auth}:lookup`,'POST',{localId:[uid]});if(result.users?.some(user=>user.localId!==uid))blocked('IDENTITY_LOOKUP_MISMATCH');return result.users?.[0]||null;};
   let account=await lookup();
   if(!state.providers){if(!account)blocked('IDENTITY_PROVIDER_HISTORY_MISSING');state.providers=(account.providerUserInfo||[]).map(provider=>provider.providerId);if(state.providers.some(provider=>!['google.com','apple.com','password'].includes(provider)))blocked('UNKNOWN_IDENTITY_PROVIDER');await saveEvidence(evidence);}
   if(account){state.providers=[...new Set([...state.providers,...(account.providerUserInfo||[]).map(provider=>provider.providerId)])];if(state.providers.some(provider=>!['google.com','apple.com','password'].includes(provider)))blocked('UNKNOWN_IDENTITY_PROVIDER');await saveEvidence(evidence);}
   const documents=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
   const registration=`${documents}/registrations/${encodeURIComponent(uid)}`;
   const collections=await json(`${registration}:listCollectionIds`,'POST',{pageSize:100});
   if(collections.collectionIds?.length||collections.nextPageToken)blocked('FIRESTORE_SUBCOLLECTION_REVIEW_REQUIRED');
   if(state.providers.includes('apple.com')&&!state.appleRevoked){if(typeof appleRevoker?.preflight!=='function')blocked('APPLE_REVOCATION_NOT_CONFIGURED');await appleRevoker.preflight({uid});}
   if(preflightOnly)continue;
   const marker=`${documents}/account_deletions/${encodeURIComponent(uid)}`;
   await json(marker,'PATCH',{fields:{requested:{booleanValue:true}}});
   if(state.providers.includes('apple.com')&&!state.appleRevoked){if(!appleRevoker)blocked('APPLE_REVOCATION_NOT_CONFIGURED');const revoked=await appleRevoker({uid});if(revoked?.revoked!==true)blocked('APPLE_REVOCATION_UNVERIFIED');state.appleRevoked=true;await saveEvidence(evidence);}
   // Delete auth before registration; the Firestore marker blocks surviving ID tokens.
   if(account){await json(`${auth}:delete`,'POST',{localId:uid});account=await lookup();if(account)blocked('FIREBASE_AUTH_STILL_PRESENT');}
   state.authDeleted=true;await saveEvidence(evidence);
   const removed=await call(registration,'DELETE');if(!removed.ok&&removed.status!==404)blocked('FIRESTORE_ERASURE_FAILED');
   const check=await call(registration);if(check.status!==404)blocked('FIRESTORE_ERASURE_UNVERIFIED');
   state.firestoreDeleted=true;await saveEvidence(evidence);
  }
  return {...evidence,complete:!preflightOnly};
 }
 return {erase,preflight:args=>erase({...args,preflightOnly:true})};
}

// loadRefreshToken must read a server-owned encrypted token store bound to Firebase UID.
// Tokens and client secrets never enter deletion-job evidence or API responses.
export function createAppleRevoker({clientId,clientSecret,loadRefreshToken,fetchImpl=fetch}={}){
 if(!clientId||!clientSecret||typeof loadRefreshToken!=='function')blocked('APPLE_REVOCATION_NOT_CONFIGURED');
 const credentials=async uid=>{
  const refreshToken=await loadRefreshToken(uid);if(!refreshToken)blocked('APPLE_REVOCATION_TOKEN_MISSING');
  const secret=typeof clientSecret==='function'?await clientSecret():clientSecret;
  if(!secret)blocked('APPLE_REVOCATION_NOT_CONFIGURED');
  return {refreshToken,secret};
 };
 const revoke=async({uid})=>{
  const {refreshToken,secret}=await credentials(uid);
  const response=await fetchImpl('https://appleid.apple.com/auth/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:secret,token:refreshToken,token_type_hint:'refresh_token'}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(response.status!==200)blocked('APPLE_REVOCATION_FAILED');return {revoked:true};
 };
 revoke.preflight=async({uid})=>{await credentials(uid);};
 return revoke;
}
