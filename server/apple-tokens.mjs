import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
const reject=code=>{throw Object.assign(new Error(code),{code,status:503});};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const bounded=(value,max=8192)=>typeof value==='string'&&value.length>0&&value.length<=max;

// Only explicit operator credentials configure this service. Never discover keys.
export function appleTokenStoreFromEnv({store,env=process.env,fetchImpl,now}={}){
 if(!env.APPLE_TEAM_ID||!env.APPLE_KEY_ID||!env.APPLE_CLIENT_ID||!env.APPLE_PRIVATE_KEY)return null;
 return createAppleTokenStore({store,teamId:env.APPLE_TEAM_ID,keyId:env.APPLE_KEY_ID,clientId:env.APPLE_CLIENT_ID,privateKey:env.APPLE_PRIVATE_KEY,fetchImpl,now});
}
export function createAppleTokenStore({store,teamId,keyId,clientId,privateKey,fetchImpl=fetch,now=Date.now}={}){
 if(!store||!bounded(teamId,100)||!bounded(keyId,100)||!bounded(clientId,255)||!privateKey)reject('APPLE_TOKEN_STORE_NOT_CONFIGURED');
 const signingKey=createPrivateKey(privateKey);
 if(signingKey.asymmetricKeyType!=='ec'||signingKey.asymmetricKeyDetails?.namedCurve!=='prime256v1')reject('APPLE_TOKEN_KEY_INVALID');
 const secret=()=>{
  const issued=Math.floor(now()/1000),input=`${encode({alg:'ES256',kid:keyId})}.${encode({iss:teamId,iat:issued,exp:issued+300,aud:'https://appleid.apple.com',sub:clientId})}`;
  return `${input}.${sign('sha256',Buffer.from(input),{key:signingKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
 };
 async function request(url,body){
  try{return await fetchImpl(url,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),...(body?{headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)}:{})});}
  catch{reject('APPLE_TOKEN_SERVICE_UNAVAILABLE');}
 }
 async function validate(idToken,subject,rawNonce){
  if(!bounded(idToken,16384))reject('APPLE_TOKEN_INVALID');
  const parts=idToken.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))reject('APPLE_TOKEN_INVALID');
  let header,claims;
  try{header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{reject('APPLE_TOKEN_INVALID');}
  const current=Math.floor(now()/1000);
  if(header?.alg!=='RS256'||!bounded(header.kid,256)||claims?.iss!=='https://appleid.apple.com'||claims.aud!==clientId||claims.sub!==subject||!Number.isFinite(claims.exp)||claims.exp<=current||!Number.isFinite(claims.iat)||claims.iat>current+60||claims.iat<current-600||claims.nonce!==createHash('sha256').update(rawNonce).digest('hex'))reject('APPLE_TOKEN_BINDING_MISMATCH');
  const response=await request('https://appleid.apple.com/auth/keys');if(response.status!==200)reject('APPLE_KEYS_UNAVAILABLE');
  let keys;try{keys=(await response.json()).keys;}catch{reject('APPLE_KEYS_UNAVAILABLE');}
  const jwk=Array.isArray(keys)?keys.find(key=>key.kid===header.kid&&key.kty==='RSA'&&key.alg==='RS256'&&key.use==='sig'):null;
  if(!jwk)reject('APPLE_TOKEN_INVALID');
  try{if(!verify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))reject('APPLE_TOKEN_INVALID');}catch{reject('APPLE_TOKEN_INVALID');}
 }
 async function capture({identity,authorizationCode,rawNonce}={}){
  // identity comes exclusively from the server's verified Firebase token path.
  if(identity?.registration?.provider!=='apple.com'||!bounded(identity.uid,128)||!bounded(identity.appleSubject,255))reject('APPLE_AUTHORIZATION_REQUIRED');
  const codeHash=bounded(authorizationCode)?createHash('sha256').update(authorizationCode).digest('hex'):null;
  const existing=store.one('SELECT * FROM apple_refresh_tokens WHERE firebaseUid=?',identity.uid);
  if(existing){
   let prior;try{prior=store.unseal(existing.tokenCiphertext);}catch{reject('APPLE_STORED_TOKEN_INVALID');}
   if(prior.uid!==identity.uid||prior.subject!==identity.appleSubject||prior.clientId!==clientId)reject('APPLE_STORED_IDENTITY_MISMATCH');
   if((authorizationCode===undefined&&rawNonce===undefined)||prior.codeHash===codeHash)return {stored:true};
  }
  if(!bounded(authorizationCode)||!bounded(rawNonce,1024))reject('APPLE_AUTHORIZATION_REQUIRED');
  const response=await request('https://appleid.apple.com/auth/token',{client_id:clientId,client_secret:secret(),code:authorizationCode,grant_type:'authorization_code'});
  if(response.status!==200)reject('APPLE_CODE_EXCHANGE_FAILED');
  let tokens;try{tokens=await response.json();}catch{reject('APPLE_CODE_EXCHANGE_FAILED');}
  if(!bounded(tokens.refresh_token))reject('APPLE_REFRESH_TOKEN_MISSING');
  await validate(tokens.id_token,identity.appleSubject,rawNonce);
  // Encrypt the binding with the secret, so swapping database ciphertext is detected.
  const tokenCiphertext=store.seal({uid:identity.uid,subject:identity.appleSubject,clientId,codeHash,refreshToken:tokens.refresh_token});
  store.transaction(()=>{
   const previous=store.one('SELECT subject,clientId FROM apple_refresh_tokens WHERE firebaseUid=?',identity.uid);
   if(previous&&(previous.subject!==identity.appleSubject||previous.clientId!==clientId))reject('APPLE_STORED_IDENTITY_MISMATCH');
   store.run('INSERT INTO apple_refresh_tokens(firebaseUid,clientId,subject,tokenCiphertext,updatedAt) VALUES(?,?,?,?,?) ON CONFLICT(firebaseUid) DO UPDATE SET tokenCiphertext=excluded.tokenCiphertext,updatedAt=excluded.updatedAt',identity.uid,clientId,identity.appleSubject,tokenCiphertext,new Date(now()).toISOString());
  });
  return {stored:true};
 }
 async function revoke({uid}={}){
  const row=store.one('SELECT * FROM apple_refresh_tokens WHERE firebaseUid=?',uid);if(!row)reject('APPLE_REVOCATION_TOKEN_MISSING');
  let saved;try{saved=store.unseal(row.tokenCiphertext);}catch{reject('APPLE_STORED_TOKEN_INVALID');}
  if(row.clientId!==clientId||saved.uid!==uid||saved.clientId!==clientId||saved.subject!==row.subject||!bounded(saved.refreshToken))reject('APPLE_STORED_IDENTITY_MISMATCH');
  const response=await request('https://appleid.apple.com/auth/revoke',{client_id:clientId,client_secret:secret(),token:saved.refreshToken,token_type_hint:'refresh_token'});
  if(response.status!==200)reject('APPLE_REVOCATION_FAILED');
  // Keep encrypted token until deletion evidence is saved; retries must be safe.
  return {revoked:true};
 }
 revoke.preflight=async({uid}={})=>{
  const row=store.one('SELECT * FROM apple_refresh_tokens WHERE firebaseUid=?',uid);if(!row)reject('APPLE_REVOCATION_TOKEN_MISSING');
  let saved;try{saved=store.unseal(row.tokenCiphertext);}catch{reject('APPLE_STORED_TOKEN_INVALID');}
  if(row.clientId!==clientId||saved.uid!==uid||saved.clientId!==clientId||saved.subject!==row.subject||!bounded(saved.refreshToken))reject('APPLE_STORED_IDENTITY_MISMATCH');
  return {ready:true};
 };
 return {capture,revoke};
}
