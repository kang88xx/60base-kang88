import http from 'node:http';
import {isIP} from 'node:net';
import path from 'node:path';
import {createReadStream,existsSync} from 'node:fs';
import {readFile,writeFile,appendFile,rename,unlink,stat} from 'node:fs/promises';
import {createHash,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openDatabase} from './database.mjs';
import {createPlaybackLeases} from './playback-leases.mjs';
import {createAccountDeletionService} from './account-deletion.mjs';
import {probeVideo,recoverUploads,processDeletions} from './media.mjs';
import {token,digest,id,hashPassword,verifyPassword,fail,str,integer,choice,email,password,csv,HttpError} from './security.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp4':'video/mp4','.webmanifest':'application/manifest+json','.pdf':'application/pdf'};
const COOKIE='dongjakso_session';
// Runtime policy overrides legacy settings without rewriting registrations or history.
const pointsPolicy=Object.freeze({rewardUnit:'points',payoutsEnabled:false,bankLinkEnabled:false,redemptionEnabled:false,requiresKoreaDeclaration:true,consentVersion:'2026-09-17-points-kr-v1',shopOpen:false});
export function createService({directory,origin='http://localhost:4318',allowRegistration=true,trustProxy=false,persistence=null,media=null,verifyFirebase=null,gatewayKey=null,identityEraser=null,copiesEraser=null,appleTokens=null,mobileServicesFactory=null}={}){
 const store=openDatabase(directory);const {db,run,one,all,now,transaction,audit,settings,wallet,publicUser}=store;
 const configuredOrigin=new URL(origin).origin,secure=configuredOrigin.startsWith('https:'),locks=new Set();
 // Keep shipped native clients working while the canonical web origin migrates.
 const productionOrigins=['https://60base.ai','https://60base.kr'];
 const allowedOrigins=new Set(productionOrigins.includes(configuredOrigin)?productionOrigins:[configuredOrigin]);
 const checkpoint=()=>persistence?persistence.checkpoint(store):Promise.resolve();
 let localQueue=Promise.resolve();
 const serialize=operation=>{if(persistence)return persistence.serial(operation);const next=localQueue.then(operation,operation);localQueue=next.catch(()=>{});return next;};
 const cleanupOptions=media?{remove:media.remove,beforeDelete:async()=>{await checkpoint();await persistence?.assertCurrent();}}:undefined;
 async function maintain(){
  if(persistence)await persistence.assertCurrent();
  if(media){for(const upload of all('SELECT * FROM uploads WHERE createdAt<?',new Date(Date.now()-86400000).toISOString()))transaction(()=>media.discardUpload(store,upload));await media.cleanup(store);}
  await processDeletions(store,cleanupOptions);
  run('DELETE FROM sessions WHERE expiresAt<?',Date.now());run('DELETE FROM limits WHERE untilAt<?',Date.now());await checkpoint();
 }
 if(!media)recoverUploads(store);
 let cleanupPromise=media?Promise.resolve():processDeletions(store);
 const cleanupTimer=setInterval(()=>{cleanupPromise=serialize(maintain).catch(()=>{});},600000);cleanupTimer.unref();
 const mobileServices=mobileServicesFactory?.(store)||{};
 appleTokens ||= mobileServices.appleTokens;identityEraser ||= mobileServices.identityEraser;copiesEraser ||= mobileServices.copiesEraser;
 const playbackLeases=createPlaybackLeases(store);
 const accountDeletion=createAccountDeletionService(store,{media,checkpoint,assertCurrent:()=>persistence?.assertCurrent(),identityEraser,copiesEraser});
 const authMethod=user=>{if(!user)return null;if(!one('SELECT uid FROM auth_identities WHERE userId=?',user.id))return 'password';try{return JSON.parse(user.consent).provider==='apple.com'?'apple':'google';}catch{return 'google';}};
 const publicSettings=()=>{const s=settings();return {operatorName:s.operatorName,contactEmail:s.contactEmail,notice:s.notice,intakeOpen:s.intakeOpen,shopOpen:s.shopOpen,maxVideoBytes:s.maxVideoBytes,consentVersion:s.consentVersion,payoutMinimum:s.payoutMinimum,...pointsPolicy};};
 const safeVideo=v=>v?{...v,path:undefined,sha:undefined,checks:JSON.parse(v.checks),consent:JSON.parse(v.consent)}:null;
 const safePayout=p=>({...p,bank:store.maskBank(store.unseal(p.bank))});
 const safeOrder=o=>({...o,items:JSON.parse(o.items)});
 const getUser=req=>{const match=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));if(!match)return null;const session=one('SELECT * FROM sessions WHERE token=? AND expiresAt>?',digest(match.slice(COOKIE.length+1)),Date.now());if(!session)return null;const user=one("SELECT * FROM users WHERE id=? AND status='active'",session.userId);return user?{user,session}:null;};
 const requireUser=req=>{const found=getUser(req);if(!found)fail(401,'로그인이 필요합니다.');if(found.user.forcePassword&&!new URL(req.url,origin).pathname.endsWith('/account'))fail(403,'임시 비밀번호를 먼저 변경해주세요.');return found;};
 const admin=req=>{const found=requireUser(req);if(found.user.role!=='admin')fail(403,'관리자 권한이 필요합니다.');if(found.user.forcePassword&&!new URL(req.url,origin).pathname.endsWith('/account'))fail(403,'임시 비밀번호를 먼저 변경해주세요.');return found.user;};
 const rate=(req,name,max,windowMs=900000)=>{const forwarded=String(req.headers['x-forwarded-for']||'').split(',').pop().trim(),remote=req.dongjaksoClientIp||(trustProxy&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&isIP(forwarded)?forwarded:req.socket.remoteAddress);const scope=name.startsWith('write')?getUser(req)?.user.id||remote:remote;const key=digest(`${name}:${scope}`),entry=one('SELECT * FROM limits WHERE key=?',key),t=Date.now();if(entry&&entry.untilAt>t&&entry.count>=max)fail(429,'잠시 후 다시 시도해주세요.');if(!entry||entry.untilAt<t)run('INSERT OR REPLACE INTO limits VALUES(?,?,?)',key,1,t+windowMs);else run('UPDATE limits SET count=count+1 WHERE key=?',key);};
 async function body(req,max=65536){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>max)fail(413,'요청 크기가 너무 큽니다.');chunks.push(chunk);}try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!result||typeof result!=='object'||Array.isArray(result))fail(400,'요청 내용을 확인해주세요.');return result;}catch{fail(400,'요청 내용을 확인해주세요.');}}
 const send=async(res,status,data)=>{await checkpoint();res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 const setSession=(res,user)=>{const raw=token(),csrf=token();run('INSERT INTO sessions VALUES(?,?,?,?,?)',digest(raw),user.id,csrf,Date.now()+86400000,Date.now());res.setHeader('Set-Cookie',`${COOKIE}=${raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure?'; Secure':''}`);return {user:publicUser(user),csrf,authMethod:authMethod(user)};};
 const ownVideo=(req,videoId)=>{const {user}=requireUser(req),video=one('SELECT * FROM videos WHERE id=?',videoId);if(!video||(video.userId!==user.id&&user.role!=='admin'))fail(404,'영상을 찾을 수 없습니다.');return {user,video};};
 function csrf(req){const requestOrigin=req.headers.origin;if(!allowedOrigins.has(requestOrigin))fail(403,'요청 출처를 확인할 수 없습니다.');const session=getUser(req)?.session;if(session&&req.headers['x-csrf-token']!==session.csrf)fail(403,'화면을 새로고침한 뒤 다시 시도해주세요.');}
 function once(user,kind,key,payload,create){
  const requestKey=str(key,'요청 번호',100,16),fingerprint=digest(JSON.stringify(payload));
  return transaction(()=>{const old=one('SELECT * FROM requests WHERE userId=? AND kind=? AND key=?',user.id,kind,requestKey);if(old){if(old.payload!==fingerprint)fail(409,'신청 내용이 변경되었습니다. 화면을 새로고침해주세요.');return old.responseId;}const responseId=create();run('INSERT INTO requests VALUES(?,?,?,?,?,?)',user.id,kind,requestKey,fingerprint,responseId,now());return responseId;});
 }
 const jsonRows=(table,field,userId)=>all(`SELECT * FROM ${table} WHERE ${field}=? ORDER BY createdAt DESC LIMIT 500`,userId);
 const reviewStages=['ai','manual','client','complete'];
 const completeChecks=checks=>['framing','hands','privacy','completion'].every(k=>checks?.[k]===true);
 const parseChecks=value=>{try{return JSON.parse(value||'{}');}catch{return {};}};
 function walletMap(users){
  const map=new Map(users.map(u=>[u.id,{balance:0,available:0,pending:0,paid:0,earned:0,totalEarned:0}]));
  if(!users.length)return map;
  const ids=users.map(u=>u.id),marks=ids.map(()=>'?').join(',');
  for(const row of all(`SELECT userId,COALESCE(SUM(amount),0) totalEarned,COALESCE(SUM(CASE WHEN kind='reward' THEN amount ELSE 0 END),0) earned FROM ledger WHERE userId IN (${marks}) GROUP BY userId`,...ids)){const current=map.get(row.userId);if(current){current.totalEarned=row.totalEarned;current.earned=row.earned;}}
  for(const row of all(`SELECT userId,status,COALESCE(SUM(amount),0) total FROM payouts WHERE userId IN (${marks}) AND status IN ('pending','paid') GROUP BY userId,status`,...ids)){const current=map.get(row.userId);if(current)current[row.status==='paid'?'paid':'pending']=row.total;}
  for(const current of map.values()){current.balance=current.totalEarned-current.paid;current.available=current.totalEarned-current.paid-current.pending;delete current.totalEarned;}
  return map;
 }
 function videoCountMap(users){
  const map=new Map(users.map(u=>[u.id,0]));if(!users.length)return map;
  const ids=users.map(u=>u.id),marks=ids.map(()=>'?').join(',');
  for(const row of all(`SELECT userId,COUNT(*) n FROM videos WHERE userId IN (${marks}) GROUP BY userId`,...ids))map.set(row.userId,row.n);
  return map;
 }
 async function api(req,res,url){
  const p=url.pathname.replace(/^\/api/,'').replace(/\/$/,''),method=req.method;
  if(method==='GET'&&p==='/health')return send(res,200,{online:true,storage:media?'huggingface':'persistent',payments:'disabled',rewardUnit:pointsPolicy.rewardUnit,payoutsEnabled:pointsPolicy.payoutsEnabled,version:1,reviewWorkflowVersion:1});
  if(!['GET','HEAD'].includes(method)){csrf(req);rate(req,method==='PUT'?'write-chunk':'write',method==='PUT'?600:180,60000);}
  if(method==='GET'&&p==='/session'){const s=getUser(req);return send(res,200,{online:true,user:publicUser(s?.user),csrf:s?.session.csrf||null,settings:publicSettings(),authProvider:verifyFirebase?'google':'password',authMethod:authMethod(s?.user)});}
  if(method==='GET'&&p==='/catalog')return send(res,200,{tasks:all('SELECT * FROM tasks WHERE published=1 ORDER BY createdAt'),products:all('SELECT * FROM products WHERE published=1 ORDER BY createdAt DESC'),announcements:all('SELECT * FROM announcements WHERE published=1 ORDER BY createdAt DESC LIMIT 20'),settings:publicSettings()});
  if(method==='POST'&&p==='/auth/firebase'){
   if(!verifyFirebase)fail(503,'Google 계정 연결을 준비하고 있습니다.');rate(req,'google-login',12);
   const b=await body(req,20000),identity=await verifyFirebase(b.idToken);
   if(identity.registration.provider==='apple.com'){if(!appleTokens)fail(503,'Apple 계정 연결을 준비하고 있습니다.');await appleTokens.capture({identity,authorizationCode:b.appleAuthorization?.authorizationCode,rawNonce:b.appleAuthorization?.rawNonce});}
   const linked=one("SELECT u.* FROM auth_identities i JOIN users u ON u.id=i.userId WHERE i.provider='firebase' AND i.uid=?",identity.uid);
   let user=linked;
   if(linked){if(linked.status!=='active'||linked.email!==identity.email.toLowerCase())fail(403,'계정 연결 상태를 운영자에게 확인해주세요.');}
   else{
    const mail=email(identity.email),existing=one('SELECT id FROM users WHERE email=?',mail);if(existing){audit(null,'account.google.link_requested',existing.id,{provider:'firebase',uid:identity.uid,email:mail,registration:identity.registration});fail(409,'기존 운영 계정이 있습니다. 계정 연결을 운영자에게 요청해주세요.');}
    const uid=id('usr'),encoded=await hashPassword(token());
    transaction(()=>{run('INSERT INTO users(id,email,password,name,createdAt,updatedAt,consent) VALUES(?,?,?,?,?,?,?)',uid,mail,encoded,str(identity.registration.displayName||identity.name,'이름',60),now(),now(),JSON.stringify(identity.registration));run('INSERT INTO auth_identities VALUES(?,?,?,?)','firebase',identity.uid,uid,now());audit({id:uid},'account.google.register',uid);});user=one('SELECT * FROM users WHERE id=?',uid);
   }
   audit(user,'account.google.login',user.id);return send(res,200,setSession(res,user));
  }
  if(method==='POST'&&p==='/auth/register'){
   rate(req,'register',5,3600000);if(!allowRegistration)fail(503,'현재 회원 가입을 준비하고 있습니다.');const b=await body(req);const mail=email(b.email),name=str(b.name,'이름',60),pw=password(b.password);
   if(b.terms!==true||b.privacy!==true||b.adult!==true)fail(400,'이용약관·개인정보 안내와 만 19세 이상 여부를 확인해주세요.');
   const hash=await hashPassword(pw);if(one('SELECT id FROM users WHERE email=?',mail))fail(409,'이미 사용 중인 이메일입니다. 로그인 정보를 확인해주세요.');
   const uid=id('usr');run('INSERT INTO users(id,email,password,name,createdAt,updatedAt,consent) VALUES(?,?,?,?,?,?,?)',uid,mail,hash,name,now(),now(),JSON.stringify({terms:true,privacy:true,adult:true,version:settings().consentVersion,at:now(),emailVerified:false}));const user=one('SELECT * FROM users WHERE id=?',uid);audit(user,'account.register',uid);return send(res,201,setSession(res,user));
  }
  if(method==='POST'&&p==='/auth/login'){
   rate(req,'login',12);const b=await body(req);const mail=email(b.email),pw=typeof b.password==='string'?b.password:'';if(pw.length>128)fail(400,'로그인 정보를 확인해주세요.');const user=one('SELECT * FROM users WHERE email=?',mail);const valid=await verifyPassword(pw,user?.password||'00000000000000000000000000000000:'+('0'.repeat(128)));if(!valid||user?.status!=='active')fail(401,'이메일과 비밀번호 또는 계정 상태를 확인해주세요.');audit(user,'account.login',user.id);return send(res,200,setSession(res,user));
  }
  if(method==='POST'&&p==='/auth/logout'){const s=getUser(req);if(s)run('DELETE FROM sessions WHERE token=?',s.session.token);res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`);return send(res,200,{ok:true});}
  if(method==='PATCH'&&p==='/account'){
   const {user}=requireUser(req),b=await body(req);if('bank' in b)fail(409,'국내 은행 연동 예정입니다. 현재는 포인트 적립만 운영합니다.');let name=user.name,bank=user.bank,hash=user.password,force=user.forcePassword;
   if(b.name!==undefined)name=str(b.name,'이름',60);
   if(b.newPassword){if(!await verifyPassword(String(b.currentPassword||''),user.password))fail(400,'현재 비밀번호를 확인해주세요.');hash=await hashPassword(password(b.newPassword));force=0;}
   transaction(()=>{run('UPDATE users SET name=?,bank=?,password=?,forcePassword=?,updatedAt=? WHERE id=?',name,bank,hash,force,now(),user.id);if(b.newPassword)run('DELETE FROM sessions WHERE userId=?',user.id);audit(user,'account.update',user.id,{passwordChanged:!!b.newPassword,bankChanged:!!b.bank});});
   const updated=one('SELECT * FROM users WHERE id=?',user.id);return send(res,200,b.newPassword?setSession(res,updated):{user:publicUser(updated)});
  }
  if(p==='/account/deletion'){const {user}=requireUser(req);if(method==='GET')return send(res,200,{deletion:accountDeletion.get(user)});if(method==='POST'){const b=await body(req);if(b.confirm!=='DELETE')fail(400,'계정과 데이터 삭제 확인이 필요합니다.');return send(res,202,{deletion:accountDeletion.request(user)});}}
  if(method==='GET'&&p==='/me'){const {user}=requireUser(req);return send(res,200,{user:publicUser(user),videos:jsonRows('videos','userId',user.id).map(safeVideo),wallet:wallet(user.id),ledger:jsonRows('ledger','userId',user.id),payouts:jsonRows('payouts','userId',user.id).map(safePayout),orders:jsonRows('orders','userId',user.id).map(safeOrder),tickets:jsonRows('tickets','userId',user.id)});}
  if(method==='POST'&&p==='/uploads'){
   const {user}=requireUser(req),b=await body(req),s=settings();if(!s.intakeOpen)fail(409,'현재 영상 접수가 잠시 중단되어 있습니다.');const task=one('SELECT * FROM tasks WHERE id=? AND published=1',str(b.taskId,'촬영 활동',100));if(!task)fail(400,'모집 중인 촬영 활동을 선택해주세요.');
   const total=integer(b.size,'파일 크기',32,s.maxVideoBytes),mime=choice(b.mime,['video/mp4','video/webm'],'영상 형식'),duration=Number(b.duration);if(Number.isFinite(duration)&&(duration<0||duration>1800))fail(400,'영상 길이를 확인해주세요.');
   const metadata={taskId:task.id,captureTask:task,reward:task.reward,title:str(b.title,'영상 제목',120),filename:str(b.filename,'파일명',200),mime,duration,width:integer(b.width,'가로 해상도',1,16384),height:integer(b.height,'세로 해상도',1,16384)};const uid=id('up');
   transaction(()=>{const global=one('SELECT COALESCE(SUM(size),0) bytes FROM videos').bytes+one('SELECT COALESCE(SUM(total),0) bytes FROM uploads').bytes;const personal=one('SELECT COALESCE(SUM(size),0) bytes FROM videos WHERE userId=?',user.id).bytes+one('SELECT COALESCE(SUM(total),0) bytes FROM uploads WHERE userId=?',user.id).bytes;if(global+total>s.totalStorageBytes||personal+total>s.memberStorageBytes)fail(409,'저장 공간 한도에 도달했습니다. 운영자에게 문의해주세요.');run('INSERT INTO uploads VALUES(?,?,?,?,?,?)',uid,user.id,JSON.stringify(metadata),total,0,now());});
   if(!media)await writeFile(path.join(directory,'uploads',uid),Buffer.alloc(0),{mode:0o600,flag:'wx'});return send(res,201,{id:uid,offset:0,chunkSize:2097152});
  }
  let match=p.match(/^\/uploads\/([\w-]+)(?:\/(complete))?$/);
  if(match){
   const {user}=requireUser(req),upload=one('SELECT * FROM uploads WHERE id=? AND userId=?',match[1],user.id);if(!upload)fail(404,'업로드 기록을 찾을 수 없습니다.');if(locks.has(upload.id))fail(409,'이 업로드를 처리 중입니다.');const file=path.join(directory,'uploads',upload.id);
   if(method==='GET')return send(res,200,{id:upload.id,offset:upload.received,total:upload.total});
   if(method==='DELETE'){if(media){transaction(()=>media.discardUpload(store,upload));await media.cleanup(store);}else{run('DELETE FROM uploads WHERE id=?',upload.id);await unlink(file).catch(()=>{});}return send(res,200,{ok:true});}
   locks.add(upload.id);try{
    if(method==='PUT'&&!match[2]){
     const offset=Number(url.searchParams.get('offset'));if(offset!==upload.received)fail(409,'업로드 위치가 일치하지 않습니다. 다시 시도해주세요.');const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2097152||upload.received+size>upload.total)fail(413,'업로드 조각의 크기가 너무 큽니다.');chunks.push(chunk);}if(!size)fail(400,'빈 업로드입니다.');if(media)await media.writeChunk(store,upload,offset,Buffer.concat(chunks));else{await appendFile(file,Buffer.concat(chunks));run('UPDATE uploads SET received=received+? WHERE id=?',size,upload.id);}return send(res,200,{offset:upload.received+size});
    }
    if(method==='POST'&&match[2]){
     if(upload.received!==upload.total)fail(409,'업로드가 아직 완료되지 않았습니다.');if(media)await media.assemble(store,upload);const meta=JSON.parse(upload.metadata),hasher=createHash('sha256');let head;for await(const chunk of createReadStream(file)){head??=chunk.subarray(0,32);hasher.update(chunk);}const valid=meta.mime==='video/mp4'?head?.subarray(4,8).toString()==='ftyp':head?.subarray(0,4).toString('hex')==='1a45dfa3';if(!valid)fail(400,'지원하는 MP4 또는 WebM 파일이 아닙니다.');const sha=hasher.digest('hex');const duplicate=one('SELECT id,status FROM videos WHERE userId=? AND sha=?',user.id,sha);if(duplicate){if(media){transaction(()=>media.discardUpload(store,upload));await media.cleanup(store);}else run('DELETE FROM uploads WHERE id=?',upload.id);await unlink(file);if(['deleted','deleting'].includes(duplicate.status))fail(409,'이미 삭제 요청된 영상입니다. 다른 영상을 선택해주세요.');return send(res,200,{id:duplicate.id,duplicate:true});}
     if(media){
      const verified=await probeVideo(file),saved=await media.putVideo(upload,file,sha,meta.mime);
      transaction(()=>{run('INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,captureTask,path,sha,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',saved.id,user.id,meta.taskId,meta.title,meta.filename,meta.mime,upload.total,verified.duration,verified.width,verified.height,meta.reward,JSON.stringify(meta.captureTask||{}),saved.key,sha,now());media.discardUpload(store,upload,{keepVideo:true});audit(user,'video.upload',saved.id,{bytes:upload.total,storage:'huggingface'});});
      await checkpoint();await media.cleanup(store);await media.release(file);return send(res,201,{id:saved.id});
     }
     const verified=await probeVideo(file),vid=id('vid'),destination=path.join(directory,'videos',vid);await rename(file,destination);try{transaction(()=>{run('INSERT INTO videos(id,userId,taskId,title,filename,mime,size,duration,width,height,reward,captureTask,path,sha,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',vid,user.id,meta.taskId,meta.title,meta.filename,meta.mime,upload.total,verified.duration,verified.width,verified.height,meta.reward,JSON.stringify(meta.captureTask||{}),vid,sha,now());run('DELETE FROM uploads WHERE id=?',upload.id);audit(user,'video.upload',vid,{bytes:upload.total});});}catch(e){await rename(destination,file);throw e;}return send(res,201,{id:vid});
    }
   }finally{locks.delete(upload.id);if(media&&match[2])await media.release(file);}
  }
  match=p.match(/^\/videos\/([\w-]+)(?:\/(file|submit|export|playback))?$/);
  if(match){
   const leased=['GET','HEAD'].includes(method)&&match[2]==='file'&&url.searchParams.has('playback');
   const {user,video}=leased?playbackLeases.resolve(url.searchParams.get('playback'),match[1]):ownVideo(req,match[1]);
   if(method==='POST'&&match[2]==='playback'){const lease=playbackLeases.issue(user,requireUser(req).session,video);return send(res,201,{url:`${req.headers.origin}/api/videos/${encodeURIComponent(video.id)}/file?playback=${lease.token}`,expiresAt:lease.expiresAt});}
   if(leased){res.setHeader('Cross-Origin-Resource-Policy','cross-origin');res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');}
   if(['GET','HEAD'].includes(method)&&match[2]==='file'){if(['deleting','deleted'].includes(video.status))fail(404,'삭제된 영상입니다.');return media?media.serve(req,res,video):serveFile(req,res,path.join(directory,'videos',video.path),video.mime);}
   if(method==='GET')return send(res,200,{video:safeVideo(video),reviews:all(user.role==='admin'?'SELECT r.stage,r.decision,r.reason,r.checks,r.revision,r.createdAt,u.name actorName FROM reviews r LEFT JOIN users u ON u.id=r.actorId WHERE r.videoId=? ORDER BY r.createdAt':'SELECT stage,decision,reason,checks,revision,createdAt FROM reviews WHERE videoId=? ORDER BY createdAt',video.id).map(r=>({...r,checks:JSON.parse(r.checks)})),annotations:all('SELECT start,end,label,note FROM annotations WHERE videoId=? ORDER BY start',video.id),task:JSON.parse(video.captureTask||'{}').id?JSON.parse(video.captureTask):one('SELECT * FROM tasks WHERE id=?',video.taskId)});
   if(method==='POST'&&match[2]==='submit'){
    const b=await body(req);if(user.id!==video.userId)fail(403,'본인 영상만 제출할 수 있습니다.');if(!settings().intakeOpen)fail(409,'현재 접수가 중단되어 있습니다.');if(!['uploaded','rejected'].includes(video.status))fail(409,'이미 접수된 영상입니다.');if(['filming','privacy','usage','training'].some(k=>b[k]!==true))fail(400,'촬영·개인정보·이용 동의와 교육 확인이 필요합니다.');if(b.recordedInKorea!==true)fail(400,'대한민국에서 직접 촬영한 영상인지 확인해주세요.');const consent={filming:true,privacy:true,usage:true,training:true,recordedInKorea:true,locationVerification:'self-declared',rewardUnit:pointsPolicy.rewardUnit,version:pointsPolicy.consentVersion,at:now()};transaction(()=>{if(!['uploaded','rejected'].includes(one('SELECT status FROM videos WHERE id=?',video.id).status))fail(409,'이미 접수된 영상입니다.');run("UPDATE videos SET status='submitted',reviewStage='ai',submittedAt=?,reviewedAt=NULL,revision=revision+1,reason='',checks='{}',consent=? WHERE id=?",now(),JSON.stringify(consent),video.id);audit(user,'video.submit',video.id,{revision:video.revision+1,stage:'ai'});});return send(res,200,{ok:true,video:{id:video.id,title:video.title,reward:video.reward,taskId:video.taskId,status:'submitted',reviewStage:'ai'},task:JSON.parse(video.captureTask||'{}')});
   }
   if(method==='DELETE'&&!match[2]){if(video.status!=='uploaded')fail(409,'접수된 영상은 문의를 통해 삭제를 요청해주세요.');if(media){transaction(()=>{run("UPDATE videos SET status='deleting',title='삭제 요청 영상',filename='' WHERE id=?",video.id);run('INSERT INTO cleanup_jobs(videoId,file,createdAt) VALUES(?,?,?)',video.id,video.path,now());audit(user,'video.delete',video.id);});await processDeletions(store,cleanupOptions);return send(res,200,{ok:true,cleanupPending:!!one('SELECT videoId FROM cleanup_jobs WHERE videoId=?',video.id)});}transaction(()=>{run('DELETE FROM videos WHERE id=?',video.id);audit(user,'video.delete',video.id);});await unlink(path.join(directory,'videos',video.path)).catch(()=>{});return send(res,200,{ok:true});}
  }
  if(method==='POST'&&['/payouts','/orders'].includes(p)){requireUser(req);fail(409,'현재는 포인트 적립만 운영합니다. 출금과 상품 구매는 준비 중입니다.');}
  if(method==='POST'&&p==='/tickets'){const {user}=requireUser(req),b=await body(req),ticketId=id('msg');run('INSERT INTO tickets(id,userId,subject,message,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',ticketId,user.id,str(b.subject,'문의 제목',120),str(b.message,'문의 내용',5000),now(),now());return send(res,201,{id:ticketId});}
  match=p.match(/^\/(orders|payouts)\/([\w-]+)\/cancel$/);
  if(method==='POST'&&match){requireUser(req);fail(409,'현재는 포인트 적립만 운영합니다. 출금과 주문 처리는 준비 중입니다.');}
  if(p.startsWith('/admin'))return adminApi(req,res,url,p,await (method==='GET'?Promise.resolve(null):body(req)));
  fail(404,'요청한 기능을 찾을 수 없습니다.');
 }
 // Administrator routes are defined separately below and share transactional data access.
 async function adminApi(req,res,url,p,b){
  const actor=admin(req),method=req.method;
  if(method==='GET'&&p==='/admin/account-deletions')return send(res,200,{deletions:accountDeletion.list(actor)});
  const deletionMatch=p.match(/^\/admin\/account-deletions\/([\w-]+)\/process$/);
  if(method==='POST'&&deletionMatch){if(b.confirm!==deletionMatch[1])fail(400,'삭제 요청 번호 확인이 필요합니다.');if(locks.size)fail(409,'진행 중인 영상 처리가 끝난 뒤 다시 시도해주세요.');return send(res,200,{deletion:await accountDeletion.process(actor,deletionMatch[1])});}
  if(method==='GET'&&p==='/admin/overview')return send(res,200,overview(url.searchParams.get('days')));
  if(method==='GET'&&p==='/admin/data'){const users=all('SELECT * FROM users ORDER BY createdAt DESC LIMIT 1000'),wallets=walletMap(users),videoCounts=videoCountMap(users);return send(res,200,{members:users.map(u=>({...publicUser(u),notes:u.notes,videoCount:videoCounts.get(u.id)||0,wallet:wallets.get(u.id)})),videos:all("SELECT v.*,u.name memberName,u.email memberEmail,COALESCE(json_extract(v.captureTask,'$.title'),t.title) taskTitle FROM videos v JOIN users u ON v.userId=u.id JOIN tasks t ON v.taskId=t.id ORDER BY v.createdAt DESC LIMIT 1000").map(safeVideo),tasks:all('SELECT * FROM tasks ORDER BY createdAt DESC'),products:all('SELECT * FROM products ORDER BY createdAt DESC'),payouts:all('SELECT p.*,u.name memberName FROM payouts p JOIN users u ON p.userId=u.id ORDER BY p.createdAt DESC LIMIT 1000').map(safePayout),orders:all('SELECT o.*,u.name memberName FROM orders o JOIN users u ON o.userId=u.id ORDER BY o.createdAt DESC LIMIT 1000').map(safeOrder),entries:all('SELECT * FROM entries ORDER BY date DESC LIMIT 1000'),tickets:all('SELECT t.*,u.name memberName FROM tickets t JOIN users u ON u.id=t.userId ORDER BY t.createdAt DESC LIMIT 1000'),announcements:all('SELECT * FROM announcements ORDER BY createdAt DESC'),audit:all('SELECT a.*,u.name actorName FROM audit a LEFT JOIN users u ON a.actorId=u.id ORDER BY a.createdAt DESC LIMIT 200'),settings:{...settings(),...pointsPolicy}});}
  let m=p.match(/^\/admin\/members\/([\w-]+)$/);
  if(method==='PATCH'&&m){const user=one('SELECT * FROM users WHERE id=?',m[1]);if(!user)fail(404,'회원을 찾을 수 없습니다.');const deletion=one("SELECT stage,status FROM account_deletions WHERE userId=?",user.id);if(deletion&&deletion.stage!=='requested')fail(409,'삭제 처리 중인 계정의 상태는 변경할 수 없습니다.');const status=choice(b.status,['active','suspended'],'회원 상태'),notes=str(b.notes??'','메모',2000,0);if(user.role==='admin'&&status!=='active')fail(409,'관리자 계정은 정지할 수 없습니다.');transaction(()=>{run('UPDATE users SET status=?,notes=?,updatedAt=? WHERE id=?',status,notes,now(),user.id);if(status!=='active')run('DELETE FROM sessions WHERE userId=?',user.id);audit(actor,'member.update',user.id,{status});});return send(res,200,{ok:true});}
  m=p.match(/^\/admin\/videos\/([\w-]+)\/remove$/);
   if(method==='POST'&&m){const video=one('SELECT * FROM videos WHERE id=?',m[1]);if(!video||['deleting','deleted'].includes(video.status))fail(404,'영상을 찾을 수 없습니다.');const reason=str(b.reason,'삭제 사유',1000,3);if(b.confirm!==video.id)fail(400,'삭제 대상 확인이 필요합니다.');transaction(()=>{if(run("UPDATE videos SET status='deleting',title='삭제 요청 영상',filename='',reason=?,checks='{}' WHERE id=? AND status=? AND revision=?",reason,video.id,video.status,video.revision).changes!==1)fail(409,'영상 상태가 변경되었습니다. 다시 확인해주세요.');run('INSERT INTO cleanup_jobs(videoId,file,createdAt) VALUES(?,?,?)',video.id,video.path,now());run('DELETE FROM annotations WHERE videoId=?',video.id);audit(actor,'video.remove.request',video.id,{reason});});await processDeletions(store,cleanupOptions);return send(res,200,{ok:true,cleanupPending:!!one('SELECT videoId FROM cleanup_jobs WHERE videoId=?',video.id)});}

  m=p.match(/^\/admin\/videos\/([\w-]+)\/(review|annotation)$/);
  if(method==='POST'&&m){const video=one('SELECT * FROM videos WHERE id=?',m[1]);if(!video||['deleting','deleted'].includes(video.status))fail(404,'영상을 찾을 수 없습니다.');if(m[2]==='annotation'){const start=Number(b.start),end=Number(b.end);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>video.duration)fail(400,'영상 범위 안의 시작·종료 시간을 입력해주세요.');const aid=id('ann');run('INSERT INTO annotations VALUES(?,?,?,?,?,?,?,?)',aid,video.id,start,end,str(b.label,'동작 라벨',120),str(b.note??'','메모',1000,0),actor.id,now());audit(actor,'video.annotate',video.id);return send(res,201,{id:aid});}
   const decision=choice(b.decision,['reviewing','approved','rejected'],'심사 결과'),stage=choice(b.stage,reviewStages.slice(0,3),'심사 단계'),reason=str(b.reason??'','사유',2000,decision==='rejected'?3:0),checks=b.checks&&typeof b.checks==='object'&&!Array.isArray(b.checks)?b.checks:{};let result;
   transaction(()=>{const currentActor=one('SELECT role,status FROM users WHERE id=?',actor.id);if(currentActor?.role!=='admin'||currentActor?.status!=='active')fail(403,'관리자 권한이 필요합니다.');const current=one('SELECT * FROM videos WHERE id=?',video.id);if(!current||['deleting','deleted'].includes(current.status))fail(404,'영상을 찾을 수 없습니다.');if(!['submitted','reviewing'].includes(current.status))fail(409,'이미 처리되었거나 제출되지 않은 영상입니다.');if(b.revision!==current.revision)fail(409,'다른 변경이 있습니다. 새로고침한 뒤 확인해주세요.');if(stage!==current.reviewStage)fail(409,'심사 단계가 변경되었습니다. 새로고침해주세요.');if(decision==='approved'&&stage==='manual'&&!completeChecks(checks))fail(400,'네 가지 검수 기준을 모두 확인해주세요.');if(decision==='approved'&&stage==='client'&&!completeChecks(parseChecks(current.checks)))fail(400,'내부 수작업 검수 기준을 먼저 모두 승인해주세요.');
    const nextStage=decision==='approved'?stage==='ai'?'manual':stage==='manual'?'client':'complete':stage,nextStatus=decision==='approved'&&stage==='client'?'approved':decision==='rejected'?'rejected':'reviewing',reviewedAt=now(),storedChecks=stage==='client'?parseChecks(current.checks):checks;
    const changed=run('UPDATE videos SET status=?,reviewStage=?,reason=?,checks=?,reviewedAt=? WHERE id=? AND status=? AND revision=? AND reviewStage=?',nextStatus,nextStage,reason,JSON.stringify(storedChecks),reviewedAt,current.id,current.status,current.revision,current.reviewStage);if(changed.changes!==1)fail(409,'심사 상태가 변경되었습니다. 새로고침해주세요.');
    run('INSERT INTO reviews(id,videoId,actorId,stage,decision,reason,checks,revision,createdAt) VALUES(?,?,?,?,?,?,?,?,?)',id('rev'),current.id,actor.id,stage,decision,reason,JSON.stringify(checks),current.revision,reviewedAt);if(nextStatus==='approved')run('INSERT OR IGNORE INTO ledger VALUES(?,?,?,?,?,?)',id('led'),current.userId,current.reward,'reward',current.id,reviewedAt);audit(actor,'video.review',current.id,{decision,stage,nextStage,revision:current.revision});result={stage:nextStage,status:nextStatus};});return send(res,200,{ok:true,...result});
  }
  m=p.match(/^\/admin\/payouts\/([\w-]+)(?:\/(bank))?$/);
  if(m&&(method==='PATCH'||(method==='GET'&&m[2])))fail(409,'국내 은행 연동 예정입니다. 출금 처리와 계좌 조회는 사용할 수 없습니다.');
  m=p.match(/^\/admin\/orders\/([\w-]+)$/);
  if(method==='PATCH'&&m)fail(409,'현재는 포인트 적립만 운영합니다. 주문 처리는 준비 중입니다.');
  for(const type of ['tasks','products','announcements'])if(p===`/admin/${type}`&&method==='POST'){
   const recordId=b.id?str(b.id,'항목',100):id(type.slice(0,3)),existing=one(`SELECT * FROM ${type} WHERE id=?`,recordId);if(b.id&&!existing)fail(404,'수정할 항목을 찾을 수 없습니다.');const published=b.published===true?1:0,title=str(b.title,'제목',150);
   transaction(()=>{if(type==='tasks')run('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,instructions=excluded.instructions,reward=excluded.reward,published=excluded.published,updatedAt=excluded.updatedAt',recordId,title,str(b.category,'분류',60),str(b.instructions,'촬영 안내',6000),integer(b.reward,'보상',0,1000000),published,existing?.createdAt||now(),now());if(type==='products')run('INSERT INTO products VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,price=excluded.price,stock=excluded.stock,published=excluded.published,updatedAt=excluded.updatedAt',recordId,title,str(b.description,'설명',4000),integer(b.price,'가격',1,10000000),integer(b.stock,'재고',0,100000),published,existing?.createdAt||now(),now());if(type==='announcements')run('INSERT INTO announcements VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,published=excluded.published,updatedAt=excluded.updatedAt',recordId,title,str(b.body,'공지 내용',6000),published,existing?.createdAt||now(),now());audit(actor,type+'.save',recordId);});return send(res,200,{id:recordId});
  }
  if(method==='POST'&&p==='/admin/entries'){const kind=choice(b.kind,['income','expense'],'입출금 구분'),amount=integer(b.amount,'금액',1),date=str(b.date,'거래일',10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail(400,'거래일을 확인해주세요.');const entryId=once(actor,'entry',b.requestKey,b,()=>{const entryId=id('inc');run('INSERT INTO entries VALUES(?,?,?,?,?,?,?,?,?,?)',entryId,kind,str(b.category,'항목',60),amount,str(b.party??'','거래처',120,0),str(b.reference,'증빙 번호',120,3),str(b.note??'','메모',2000,0),date,now(),actor.id);audit(actor,'finance.record',entryId,{kind,amount});return entryId;});return send(res,201,{id:entryId});}
  m=p.match(/^\/admin\/tickets\/([\w-]+)$/);
  if(method==='PATCH'&&m){if(!one('SELECT id FROM tickets WHERE id=?',m[1]))fail(404,'문의를 찾을 수 없습니다.');run('UPDATE tickets SET response=?,status=?,updatedAt=? WHERE id=?',str(b.response,'답변',6000),choice(b.status,['replied','closed'],'문의 상태'),now(),m[1]);audit(actor,'ticket.reply',m[1]);return send(res,200,{ok:true});}
  if(method==='PATCH'&&p==='/admin/settings'){if(b.shopOpen===true)fail(409,'포인트 적립 운영 중에는 상점을 열 수 없습니다.');const s=settings();for(const key of ['intakeOpen','shopOpen'])if(key in b)s[key]=b[key]===true;for(const key of ['operatorName','contactEmail','notice'])if(key in b)s[key]=str(b[key],key,key==='notice'?1000:120,key==='notice'?0:1);email(s.contactEmail);transaction(()=>{for(const [key,value] of Object.entries(s))run('UPDATE settings SET value=? WHERE key=?',JSON.stringify(value),key);audit(actor,'settings.update','settings',{intakeOpen:s.intakeOpen,shopOpen:s.shopOpen});});return send(res,200,{ok:true});}
  if(method==='GET'&&p==='/admin/export'){const kind=choice(url.searchParams.get('type'),['members','videos','payouts','orders','entries','audit'],'내보낼 항목');const exports={members:()=>{const users=all('SELECT * FROM users ORDER BY createdAt'),wallets=walletMap(users);return [['회원번호','이름','이메일','상태','보유 포인트','가용 포인트','대기 포인트','지급 포인트','누적 적립','가입일'],...users.map(u=>{const w=wallets.get(u.id);return [u.id,u.name,u.email,u.status,w.balance,w.available,w.pending,w.paid,w.earned,u.createdAt];})];},videos:()=>[['영상번호','회원번호','제목','상태','심사단계','길이(초)','용량','접수일'],...all('SELECT * FROM videos ORDER BY createdAt').map(v=>[v.id,v.userId,v.title,v.status,v.reviewStage,v.duration,v.size,v.submittedAt])],payouts:()=>[['신청번호','회원번호','금액','상태','확인번호','신청일'],...all('SELECT * FROM payouts').map(p=>[p.id,p.userId,p.amount,p.status,p.reference,p.createdAt])],orders:()=>[['주문번호','회원번호','금액','방식','상태','주문일'],...all('SELECT * FROM orders').map(o=>[o.id,o.userId,o.total,o.method,o.status,o.createdAt])],entries:()=>[['거래번호','구분','항목','금액','거래처','증빙','거래일'],...all('SELECT * FROM entries').map(e=>[e.id,e.kind,e.category,e.amount,e.party,e.reference,e.date])],audit:()=>[['기록번호','관리자','작업','대상','시각'],...all('SELECT * FROM audit ORDER BY createdAt').map(a=>[a.id,a.actorId,a.action,a.target,a.createdAt])]};audit(actor,'data.export',kind);await checkpoint();res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="dongjakso-${kind}.csv"`});res.end(csv(exports[kind]()));return;}
  fail(404,'관리자 기능을 찾을 수 없습니다.');
 }
 function overview(requestedDays){const days=[7,30,90].includes(Number(requestedDays))?Number(requestedDays):30,sinceDay=new Date(Date.now()+9*3600000-(days-1)*86400000).toISOString().slice(0,10),since=new Date(sinceDay+'T00:00:00+09:00').toISOString(),scalar=(sql,...a)=>Object.values(one(sql,...a))[0];
  const trend=all("SELECT date(createdAt,'+9 hours') day,COUNT(*) count,SUM(duration) seconds FROM videos WHERE createdAt>=? GROUP BY day ORDER BY day",since),income=scalar("SELECT COALESCE(SUM(amount),0) FROM entries WHERE kind='income' AND date>=?",sinceDay),expenses=scalar("SELECT COALESCE(SUM(amount),0) FROM entries WHERE kind='expense' AND date>=?",sinceDay),sales=scalar("SELECT COALESCE(SUM(amount),0) FROM finance_events WHERE createdAt>=? AND method='manual'",since),rewardSales=scalar("SELECT COALESCE(SUM(amount),0) FROM finance_events WHERE createdAt>=? AND method='reward'",since),paid=scalar("SELECT COALESCE(SUM(amount),0) FROM payouts WHERE status='paid' AND resolvedAt>=?",since);
  return {days,members:scalar("SELECT COUNT(*) FROM users WHERE role='member'"),newMembers:scalar("SELECT COUNT(*) FROM users WHERE role='member' AND createdAt>=?",since),videos:scalar('SELECT COUNT(*) FROM videos'),seconds:scalar("SELECT COALESCE(SUM(duration),0) FROM videos WHERE status NOT IN ('deleted','deleting')"),bytes:scalar('SELECT COALESCE(SUM(size),0) FROM videos'),pendingReviews:scalar("SELECT COUNT(*) FROM videos WHERE status IN ('submitted','reviewing')"),approved:scalar("SELECT COUNT(*) FROM videos WHERE status='approved'"),rejected:scalar("SELECT COUNT(*) FROM videos WHERE status='rejected'"),pendingPayouts:scalar("SELECT COALESCE(SUM(amount),0) FROM payouts WHERE status='pending'"),openTickets:scalar("SELECT COUNT(*) FROM tickets WHERE status='open'"),income:income+sales,expenses:expenses+paid,net:income+sales-expenses-paid,trend,categories:all('SELECT t.category,COUNT(*) count,SUM(v.duration) seconds FROM videos v JOIN tasks t ON v.taskId=t.id GROUP BY t.category'),statuses:all('SELECT status,COUNT(*) count FROM videos GROUP BY status'),settings:{...settings(),...pointsPolicy},finance:{recordedIncome:income,orderSales:sales,rewardSales,recordedExpenses:expenses,payouts:paid}};
 }
 async function serveFile(req,res,file,mime){const info=await stat(file).catch(e=>{if(e.code==='ENOENT')fail(404,'파일을 찾을 수 없습니다.');throw e;}),range=req.headers.range;let start=0,end=info.size-1,status=200;if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))fail(416,'잘못된 영상 범위입니다.');start=m[1]?Number(m[1]):Math.max(0,info.size-Number(m[2]));end=m[1]&&m[2]?Math.min(Number(m[2]),info.size-1):info.size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=info.size)fail(416,'잘못된 영상 범위입니다.');status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);}res.writeHead(status,{'Content-Type':mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes'});if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);}
 async function handle(req,res,url){
  try{
   if(url.pathname.startsWith('/api/'))return await api(req,res,url);
   if(!['GET','HEAD'].includes(req.method))fail(405,'허용되지 않은 요청입니다.');
   let relative=decodeURIComponent(url.pathname);if(relative.endsWith('/'))relative+='index.html';
   if(relative.split('/').some(v=>v.startsWith('.'))||!/^\/(?:index\.html|styles\.css|main\.js|i18n\.js|buyer-components\.(?:css|js)|studio\/|admin\/|app\/|shared\/|assets\/|fonts\/|docs\/60BASE-Company-Profile-KO\.pdf)/.test(relative))fail(404,'페이지를 찾을 수 없습니다.');
   const file=path.resolve(root,'.'+relative);if(!file.startsWith(root+path.sep)||!types[path.extname(file)])fail(404,'페이지를 찾을 수 없습니다.');
   await serveFile(req,res,file,types[path.extname(file)]);
  }catch(error){
   if(res.headersSent){res.destroy();return;}
   // Failed writes still persist rate limits/audits. An uncertain checkpoint
   // instead fences the runtime and clears any not-yet-issued session cookie.
   try{if(url.pathname.startsWith('/api/'))await checkpoint();}
   catch{error=Object.assign(Error('저장소 연결을 확인하고 있습니다. 잠시 후 다시 시도해주세요.'),{status:503});}
   res.removeHeader('Set-Cookie');
   res.writeHead(error.status||500,{'Content-Type':'application/json; charset=utf-8'});
   res.end(JSON.stringify({error:error.status?error.message:'처리 중 오류가 발생했습니다. 다시 시도해주세요.'}));
   if(!error.status)console.error('[service]',error.code||error.name);
  }
 }
 const server=http.createServer(async(req,res)=>{
  req.dongjaksoClientIp=null;
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  try{
   const url=new URL(req.url,origin);
   if(gatewayKey){
    if(url.pathname==='/'&&req.method==='GET'){res.writeHead(persistence?.healthy===false?503:200,{'Content-Type':'text/plain'});res.end('Dongjakso operations');return;}
    const supplied=String(req.headers['x-dongjakso-gateway-key']||'');
    if(!timingSafeEqual(Buffer.from(digest(supplied)),Buffer.from(digest(gatewayKey))))fail(403,'접근할 수 없습니다.');
    const clientIp=req.headers['x-dongjakso-client-ip'];
    if(typeof clientIp==='string'&&isIP(clientIp.trim()))req.dongjaksoClientIp=clientIp.trim();
   }
   if(url.pathname.startsWith('/api/'))await serialize(async()=>{await persistence?.assertCurrent();return handle(req,res,url);});
   else await handle(req,res,url);
  }catch(error){
   if(res.headersSent){res.destroy();return;}res.removeHeader('Set-Cookie');res.writeHead(error.status||503,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:error.status===403?'접근할 수 없습니다.':'저장소 연결을 확인하고 있습니다. 잠시 후 다시 시도해주세요.'}));
  }
 });
 server.requestTimeout=300000;server.headersTimeout=15000;
 return {server,store,maintenance:()=>serialize(maintain),close:()=>new Promise(resolve=>{clearInterval(cleanupTimer);server.close(async()=>{await cleanupPromise;await persistence?.idle();db.close();resolve();});server.closeIdleConnections();})};
}
