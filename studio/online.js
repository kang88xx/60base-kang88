import {uploadFileInfo} from './upload-file.js';
import { assertVideoDuration, VIDEO_DURATION_HELP } from '../shared/video-policy.js';
import { isNativeApp } from '../app/native.js';
import {api,session,sessionEpoch,sessionReady,refreshSession,showAccount,dialog,esc,money,points,date,size,badge,statusLine,busy} from './online-api.js';
import {getClips} from '../shared/store.js';
import * as cloudAccount from './cloud-account.js';
import {showCloudAccount,cloudDisplayName} from './cloud-account-ui.js';
import {updateAccountMenu,closeAccountMenu} from './account-menu.js';
import {bindSupportFaq} from './support-faq.js';
import {getStudioAccess,requiresStudioAccount} from './access.js';
let releaseSupportFaq=()=>{};
const consentFields=`<label class="online-check"><input type="checkbox" name="filming" required>제가 촬영한 영상이며, 촬영 장소와 등장 인물의 동의를 확인했습니다.</label><label class="online-check"><input type="checkbox" name="privacy" required>얼굴·주소·개인 문서·사적 대화가 포함되지 않았는지 확인했습니다.</label><label class="online-check"><input type="checkbox" name="usage" required>영상과 작업 정보를 피지컬 AI 학습·연구 및 계약된 데이터 제공에 이용하는 데 동의합니다. <a href="/studio/privacy.html" target="_blank" rel="noopener">이용 범위</a></label><label class="online-check"><input type="checkbox" name="training" required>촬영 교육과 가로 화면·손/작업 대상의 가시성 기준을 확인했습니다.</label><label class="online-check"><input type="checkbox" name="recordedInKorea" required>대한민국 내에서 직접 촬영한 영상입니다.</label>`;
const supportEmail='60base.ai@gmail.com';
const uploadMark='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M5 15v5h14v-5"/></svg>';
let currentMount=null,mountVersion=0;
let bridgeInFlight=null,bridgeAttemptKey='',bridgeError=null,logoutInFlight=false,suppressBridge=false;
let cloudLogoutAttemptKey='';
let bridgeBusy=false;
export function getAccountConnectionState(){
 const cloud=cloudAccount.getCloudAccount();
 const current=cloud.phase==='registered'&&cloud.user?.uid===bridgeAttemptKey&&!session.user;
 return {busy:current&&bridgeBusy,error:current&&bridgeError?(bridgeError.message||'계정 연결을 완료하지 못했습니다.'):''};
}
function notifyAccountConnection(){window.dispatchEvent(new Event('service-account-connection'));}
export async function showAccountEntry({returnTo,provider}={}){
 await sessionReady;
 if(!session.online)await refreshSession();
 if(!session.online){
  const element=dialog('계정 연결 확인','<p class="ego-form-intro">계정 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.</p><p class="online-status" role="status" aria-live="polite"></p><button type="button" class="button primary" data-account-retry>다시 연결하기</button>');
  if(document.querySelector('#app-shell'))element.classList.add('ego-form-sheet','ego-auth-sheet');
  const retry=element.querySelector('[data-account-retry]'),status=element.querySelector('[role="status"]');
  retry.onclick=async()=>{
   retry.disabled=true;retry.setAttribute('aria-busy','true');status.textContent='계정 서비스에 다시 연결하고 있습니다.';
   try{
    await refreshSession();
    if(!element.isConnected)return;
    if(!session.online){status.textContent='계정 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.';return;}
    element.close();await showAccountEntry({returnTo,provider});
   }finally{retry.disabled=false;retry.setAttribute('aria-busy','false');}
  };
  return element;
 }
 if(session.online&&session.user)return showAccount({onSignOut:signOutAccount});
 if(provider==='email'){
  const existing=new Set(document.querySelectorAll('.online-dialog'));
  showAccount({onSignOut:signOutAccount});
  const element=[...document.querySelectorAll('.online-dialog')].find(item=>!existing.has(item));
  if(element&&document.querySelector('#app-shell')){
   element.classList.add('ego-form-sheet','ego-auth-sheet');
   element.querySelector('.online-dialog-body').insertAdjacentHTML('afterbegin','<p class="ego-form-intro">이메일과 비밀번호로 에고를 시작하세요.</p>');
  }
  return element;
 }
 if(session.online&&session.authProvider==='google'){
  const element=showCloudAccount({returnTo,provider});
  void bridgeCloudSession({force:true,interactive:true});
  return element;
 }
 if(getStudioAccess()==='allowed'){location.hash='profile';return;}
 return showCloudAccount({returnTo,provider});
}
export async function signOutAccount(){
 closeAccountMenu(true);
 logoutInFlight=true;suppressBridge=true;bridgeError=null;
  try{
  if(session.online&&session.user){await api('/auth/logout',{method:'POST'});await refreshSession();}
  if(['google','apple'].includes(session.authMethod)||cloudAccount.getCloudAccount().user)await cloudAccount.signOutCloudAccount();
 }catch{dialog('로그아웃을 완료하지 못했습니다.','<p>연결 상태를 확인하고 계정 메뉴에서 다시 시도해주세요.</p>');}
 finally{logoutInFlight=false;if(cloudAccount.getCloudAccount().phase==='signedOut')suppressBridge=false;syncAccountShell();}
}
async function bridgeCloudSession({force=false,interactive=false}={}){
 if(logoutInFlight||suppressBridge)return session;
 const cloud=cloudAccount.getCloudAccount();
 if(!session.online||session.authProvider!=='google'||session.user||cloud.phase!=='registered'||cloud.busy||!cloud.user)return session;
 const key=cloud.user.uid;
 if(!force&&bridgeAttemptKey===key)return session;
 if(bridgeInFlight)return bridgeInFlight;
 bridgeAttemptKey=key;bridgeError=null;bridgeBusy=true;notifyAccountConnection();syncAccountShell();
 bridgeInFlight=(async()=>{
  try{
   if(typeof cloudAccount.getCloudIdToken!=='function')throw Error('Google 계정 연결을 다시 확인해주세요.');
   const idToken=await cloudAccount.getCloudIdToken();
   const appleAuthorization=cloudAccount.getCloudAppleAuthorization?.();
   const result=await api('/auth/firebase',{method:'POST',body:{idToken,...(appleAuthorization?{appleAuthorization}:{})}});
   cloudAccount.clearCloudAppleAuthorization?.();
   Object.assign(session,result,{online:true,authProvider:'google',authMethod:result.authMethod||'google'});
   await refreshSession();
   bridgeError=null;
   if(currentMount?.container.isConnected)void mountOnline(...currentMount.args);
  }catch(error){
   bridgeError=error;
   if(interactive)dialog('계정 연결 확인',`<p>${esc(error.message||'Google 계정 연결을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.')}</p>`);
  }finally{
   bridgeInFlight=null;bridgeBusy=false;notifyAccountConnection();
   syncAccountShell();
  }
  return session;
 })();
 return bridgeInFlight;
}
async function clearGoogleSessionIfCloudSignedOut(){
 if(logoutInFlight||!['google','apple'].includes(session.authMethod)||!session.user)return;
 const cloud=cloudAccount.getCloudAccount();
 if(cloud.availability!=='ready'||cloud.phase!=='signedOut')return;
 const attemptKey=sessionEpoch+':'+session.user.id;
 if(cloudLogoutAttemptKey===attemptKey)return;
 cloudLogoutAttemptKey=attemptKey;
 logoutInFlight=true;suppressBridge=true;
 try{await api('/auth/logout',{method:'POST'});await refreshSession();}
 catch{dialog('계정 연결 확인','<p>로그아웃을 완료하지 못했습니다. 인터넷 연결을 확인한 뒤 설정에서 로그아웃을 다시 눌러주세요.</p>');}
 finally{logoutInFlight=false;suppressBridge=false;syncAccountShell();}
}
function syncAccountShell(){
 const cloud=cloudAccount.getCloudAccount();
 if(cloud.phase==='registered')cloudLogoutAttemptKey='';
 if(cloud.phase==='signedOut')suppressBridge=false;
 if(session.online&&session.authProvider==='google'&&!session.user)void bridgeCloudSession();
 if(['google','apple'].includes(session.authMethod)&&session.user&&cloud.availability==='ready'&&cloud.phase==='signedOut')void clearGoogleSessionIfCloudSignedOut();
 if(session.online)document.getElementById('cloud-account-panel')?.remove();
 const name=session.online?session.user?.name:cloud.phase==='registered'?cloudDisplayName():'';
 updateAccountMenu({name,email:session.online?session.user?.email:cloud.user?.email,
  signedIn:session.online?!!session.user:!!cloud.user,pending:!session.online&&!!cloud.user&&cloud.phase!=='registered',
  isGoogle:(session.online&&session.authMethod==='google')||(!session.online&&cloud.user?.provider==='google.com'),busy:(cloud.busy&&!session.online)||!!bridgeInFlight,
  onLogin:()=>void showAccountEntry(),onSignOut:()=>void signOutAccount()});
 const admin=document.querySelector('[data-online-admin]');if(admin)admin.hidden=!(session.online&&session.user?.role==='admin');
 document.querySelectorAll('[data-requires-operations],[data-nav="wallet"],[data-nav="shop"]').forEach(link=>{const shop=link.dataset.nav==='shop'||link.dataset.requiresOperations==='shop';link.hidden=!session.online||(shop&&session.settings?.shopOpen===false);});
 const reviewLabel=document.querySelector('[data-review-nav-label]');if(reviewLabel)reviewLabel.textContent=session.online?'제출·심사':'제출 안내';
 if(!session.online&&location.hash==='#profile')cloudProfile(document.getElementById('workspace'));
}
function cloudProfile(main){
 if(!main||main.dataset.access!=='allowed'||getStudioAccess()!=='allowed')return;const cloud=cloudAccount.getCloudAccount();let panel=main.querySelector('#cloud-account-panel');
 if(!panel){panel=document.createElement('section');panel.id='cloud-account-panel';panel.className='profile-account-strip';const heading=main.querySelector('.page-heading');heading?heading.insertAdjacentElement('afterend',panel):main.prepend(panel);}
 const registered=cloud.phase==='registered',ready=cloud.availability==='ready',apple=cloud.user?.provider==='apple.com';
 const providerIcon=apple?'<span>Apple</span>':'<img src="../assets/brand/google-signin-g.png" width="24" height="24" alt="Google">';
 const availabilityCopy=cloud.availability==='loading'?'계정 연결을 확인하고 있습니다.':cloud.availability==='unconfigured'?'Google 회원가입을 준비하고 있습니다.':'계정 연결을 확인해주세요.';
 panel.innerHTML=registered
  ? '<div class="profile-account-person">'+providerIcon+'<strong>'+esc(cloudDisplayName())+'</strong></div><p class="profile-account-email">'+esc(cloud.user.email)+'</p><span class="profile-account-status">'+(bridgeInFlight?'계정 연결 확인 중':apple?'Apple로 로그인됨':'Google로 로그인됨')+'</span>'+(bridgeError?'<p class="online-status">'+esc(bridgeError.message||'계정 연결을 완료하지 못했습니다.')+'</p><button type="button" class="button" data-cloud-profile-account>다시 연결하기</button>':'')
  : '<div><h2>로그인 계정</h2><p>'+ (cloud.user?'필수 확인을 마치면 회원가입이 완료됩니다.':ready?'Google 계정으로 회원가입할 수 있습니다.':availabilityCopy)+'</p></div><button type="button" class="button" data-cloud-profile-account>'+ (cloud.user?'가입 완료하기':ready?'Google로 시작하기':'계정 연결 확인')+'</button>';
 panel.querySelector('[data-cloud-profile-account]')?.addEventListener('click',()=>void showAccountEntry({returnTo:'#profile'}));
}
window.addEventListener('service-session',()=>{
 syncAccountShell();
 if(currentMount?.container.isConnected)void mountOnline(...currentMount.args);
});
cloudAccount.subscribeCloudAccount(syncAccountShell);
document.addEventListener('click',e=>{if(e.target.closest('[data-online-account]')&&!e.target.closest('[data-account-menu]'))void showAccountEntry();});
function empty(title,copy,action=''){return `<div class="online-empty"><h3>${esc(title)}</h3><p>${esc(copy)}</p>${action}</div>`;}
function actionLinks(primary='촬영 교육 보기',href='#guide'){return `<div class="online-action-row"><a class="button primary" href="${esc(href)}">${primary}</a><a class="button" href="mailto:${supportEmail}">${supportEmail}</a></div>`;}
function copyEmailButton(){return '<span class="support-copy-control"><button type="button" class="support-copy-button" data-copy-support-email aria-label="이메일 주소 복사"><img src="/studio/copy.svg" width="20" height="20" alt=""></button><span class="support-copy-tooltip" role="status" aria-live="polite" data-copy-tooltip></span></span>';}
function availabilityCard(title,copy,{primary='촬영 교육 보기',href='#guide',faq=false}={}){
 return `<section class="online-panel online-availability"><div><h2>${esc(title)}</h2><p>${esc(copy)}</p></div>${actionLinks(primary,href)}${faq?supportFaq():''}</section>`;
}
function submissionGuide(){
 return `${availabilityCard('온라인 제출에 연결하지 못했습니다.','촬영한 영상은 보관함에 저장해 두고, 연결이 복구되면 제출·심사에서 제출해주세요. 문제가 계속되면 이메일로 문의해주세요.',{primary:'보관한 영상 보기',href:'#library'})}<section class="online-panel"><h3>제출 전 확인</h3><ul class="online-bullet-list"><li>가로 화면으로 1분간 하나의 집안일 흐름을 촬영합니다.</li><li>얼굴, 주소, 문서, 차량번호 등 개인정보가 보이지 않게 확인합니다.</li><li>필요한 원본은 기기에 따로 보관해 둡니다.</li></ul></section>`;
}
function operationsPending(kind){
 const text={wallet:['포인트 내역은 아직 제공되지 않습니다.','온라인 제출과 심사 기능을 준비하고 있어 현재 이 화면에서는 내역을 표시하지 않습니다.'],shop:['촬영 장비 주문은 아직 접수하지 않습니다.','장비가 필요한 경우 운영 안내를 기다리거나 이메일로 문의해주세요.']}[kind];
 return availabilityCard(text[0],text[1],{primary:'문의하기',href:'#support'});
}
function supportFaq(){
 return `<div class="online-support-faq"><details><summary>영상을 어디에 보관하나요?</summary><p>직접 촬영하거나 가져온 영상은 사용 중인 브라우저와 기기에 저장됩니다. 필요한 파일은 직접 다운로드해 보관해주세요.</p></details><details><summary>영상이 자동으로 제출되나요?</summary><p>아니요. 저장한 뒤 심사 제출하기를 누르거나, 제출·심사에서 영상을 선택하고 동의 내용을 확인해야 접수됩니다.</p></details><details><summary>삭제나 동의 철회는 어떻게 요청하나요?</summary><p>제출 경로, 영상 제목, 요청 내용을 ${supportEmail}으로 보내주세요. 제출하지 않은 보관 영상은 직접 삭제할 수 있습니다.</p></details><details><summary>참여하려면 무엇을 먼저 하나요?</summary><p>촬영 교육을 확인하고 로그인한 뒤, 원하는 활동에서 바로 촬영하세요. 참여에 관한 질문은 이메일로 문의할 수 있습니다.</p></details></div>`;
}
function supportGuide(){
 return `<section class="online-panel online-support-card"><div><h2>도움이 필요하신가요?</h2><p>촬영, 제출, 삭제 요청은 아래 주소로 보내주세요.</p></div><div class="online-action-row"><a class="button primary" href="mailto:${supportEmail}">${supportEmail}</a>${copyEmailButton()}</div>${supportFaq()}</section>`;
}
export async function mountOnline(route,container,legacy){
 releaseSupportFaq();releaseSupportFaq=()=>{};
 const version=++mountVersion;currentMount={container,args:[route,container,legacy]};await sessionReady;if(!container.isConnected||version!==mountVersion)return;
 container.classList.add('online-ui');
 if(!session.online){container.innerHTML=route==='support'?supportGuide():route==='reviews'?submissionGuide():operationsPending(route);bindOfflineActions(container);return;}
 if(route==='support'&&!session.user){container.innerHTML=supportGuide();bindOfflineActions(container);return;}
 if(!session.user){container.innerHTML=empty('내 계정에서 이어서 진행하세요.','로그인하면 제출 영상과 심사 결과를 한곳에서 확인할 수 있습니다.','<button type="button" class="button primary" data-signin>로그인 / 회원 가입</button>');container.querySelector('[data-signin]').onclick=()=>void showAccountEntry();return;}
 container.innerHTML='<p role="status">내역을 불러오는 중입니다.</p>';
 try{const [me,catalog]=await Promise.all([api('/me'),api('/catalog')]);if(!container.isConnected||version!==mountVersion)return;
  const refresh=()=>mountOnline(route,container,legacy);
  if(route==='reviews')reviews(container,me,catalog,refresh);
  if(route==='wallet')wallet(container,me,refresh);
  if(route==='shop')shop(container,me,catalog,refresh);
  if(route==='support')support(container,me,refresh);
  if(route!=='reviews'){const b=document.createElement('button');b.type='button';b.className='button';b.textContent='새로고침';b.onclick=refresh;container.querySelector('.online-toolbar').append(b);}
  if(catalog.settings.notice)container.insertAdjacentHTML('afterbegin',`<div class="online-notice">${esc(catalog.settings.notice)}</div>`);
  if(catalog.announcements.length)container.insertAdjacentHTML('beforeend',`<section class="online-panel online-announcements"><h3>운영 안내</h3>${catalog.announcements.map(n=>`<details><summary>${esc(n.title)}</summary><p>${esc(n.body)}</p></details>`).join('')}</section>`);
 }catch(e){if(!container.isConnected||version!==mountVersion)return;container.innerHTML=empty('내역을 불러오지 못했습니다.',e.message,'<button type="button" class="button" data-retry>다시 불러오기</button>');container.querySelector('[data-retry]').onclick=()=>mountOnline(route,container,legacy);}
}
function bindOfflineActions(root){
 releaseSupportFaq=bindSupportFaq(root);
 const button=root.querySelector('[data-copy-support-email]');
 const tooltip=root.querySelector('[data-copy-tooltip]');
 let timer;
 button?.addEventListener('click',async()=>{
  clearTimeout(timer);button.disabled=true;
  try{await navigator.clipboard.writeText(supportEmail);tooltip.textContent='복사되었습니다';}
  catch{tooltip.textContent='복사하지 못했습니다';}
  finally{button.disabled=false;}
  tooltip.classList.add('is-visible');
  timer=setTimeout(()=>{tooltip.classList.remove('is-visible');tooltip.textContent='';},2200);
 });
}

function videoPoints(video){return ['deleted','deleting'].includes(video.status)?'':`<p class="online-video-points">${video.status==='approved'?'승인 포인트':video.status==='rejected'?'재검토 승인 시':'승인 시'} ${points(video.reward)}${video.status==='approved'?'':' · 아직 적립되지 않았습니다.'}</p>`;}
function reviews(container,me,catalog,refresh){
 const approved=me.videos.filter(v=>v.status==='approved').length,pending=me.videos.filter(v=>['submitted','reviewing'].includes(v.status)).length;
 container.innerHTML=`<div class="online-toolbar"><div><h2>내 영상 심사</h2><p>접수부터 결과까지, 영상별로 확인하세요.</p></div><div class="online-toolbar-actions"><button type="button" class="button" data-refresh>새로고침</button><button type="button" class="button primary" data-upload>영상 제출</button></div></div><ol class="online-review-flow"><li>영상 제출</li><li>기준 확인</li><li>승인·보완 안내</li><li>포인트 적립</li></ol><div class="online-kpis"><div class="online-kpi"><span>전체 영상</span><strong>${me.videos.length}</strong></div><div class="online-kpi"><span>검토 중</span><strong>${pending}</strong></div><div class="online-kpi"><span>승인</span><strong>${approved}</strong></div><div class="online-kpi"><span>적립 누계</span><strong>${points(me.wallet.earned)}</strong></div></div><div class="online-filter-row"><label for="online-video-search" class="sr-only">영상 검색</label><input id="online-video-search" class="online-filter" type="search" placeholder="영상 제목 검색"><label for="online-video-status" class="sr-only">심사 상태</label><select id="online-video-status" class="online-filter"><option value="all">전체 · ${me.videos.length}</option><option value="pending">검토 중 · ${pending}</option><option value="approved">승인 · ${approved}</option><option value="rejected">반려 · ${me.videos.filter(v=>v.status==='rejected').length}</option><option value="uploaded">제출 전 · ${me.videos.filter(v=>v.status==='uploaded').length}</option></select></div><div data-videos></div>`;
 const list=container.querySelector('[data-videos]'),search=container.querySelector('#online-video-search'),filter=container.querySelector('#online-video-status');
 const draw=()=>{const videos=me.videos.filter(v=>(filter.value==='all'||(filter.value==='pending'?['submitted','reviewing'].includes(v.status):v.status===filter.value))&&v.title.toLowerCase().includes(search.value.trim().toLowerCase()));list.innerHTML=videos.length?`<div class="online-list">${videos.map(v=>`<article class="online-item"><div>${badge(v.status)}<h3>${esc(v.title)}</h3><p>${date(v.submittedAt||v.createdAt)} · ${Math.round(v.duration)}초 · ${size(v.size)}</p>${videoPoints(v)}${v.reason?`<p>${esc(v.reason)}</p>`:''}</div><div class="online-item-actions">${v.status==='rejected'?'<button type="button" class="button primary" data-new-version>수정 영상 제출</button>':''}<button type="button" class="button" data-view="${esc(v.id)}">영상·상세</button>${['uploaded','rejected'].includes(v.status)?`<button type="button" class="button primary" data-resubmit="${esc(v.id)}">${v.status==='rejected'?'같은 영상 재검토':'제출하기'}</button>`:''}</div></article>`).join('')}</div>`:empty(me.videos.length?'조건에 맞는 영상이 없습니다.':'첫 영상을 제출해보세요.',me.videos.length?'검색어나 상태를 바꿔주세요.':'촬영 교육을 확인한 뒤, 파일이나 내 기록에서 영상을 선택하세요.');list.querySelectorAll('[data-new-version]').forEach(b=>b.onclick=()=>uploadDialog(catalog,refresh));list.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>viewVideo(b.dataset.view));list.querySelectorAll('[data-resubmit]').forEach(b=>b.onclick=()=>resubmit(b.dataset.resubmit,refresh));};search.oninput=draw;filter.onchange=draw;draw();container.querySelector('[data-refresh]').onclick=refresh;container.querySelector('[data-upload]').onclick=()=>uploadDialog(catalog,refresh);
}
async function metadata(blob){
 return new Promise((resolve,reject)=>{
  const v=document.createElement('video'),src=URL.createObjectURL(blob);let settled=false;
  const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);v.onloadedmetadata=v.ondurationchange=v.ontimeupdate=v.onerror=null;v.removeAttribute('src');v.load();URL.revokeObjectURL(src);error?reject(error):resolve(value);};
  const read=()=>{const duration=Number.isFinite(v.duration)&&v.duration>0?v.duration:0;if(!Number.isFinite(duration)||duration<=0||!v.videoWidth||!v.videoHeight)return false;done(null,{duration,width:v.videoWidth,height:v.videoHeight});return true;};
  const timer=setTimeout(()=>done(Error('영상 정보를 확인하지 못했습니다.')),15000);
  v.onloadedmetadata=()=>{if(!read()){v.ondurationchange=v.ontimeupdate=read;v.currentTime=1e10;}};
  v.onerror=()=>done(Error('재생 가능한 MOV·MP4·WebM 파일을 선택해주세요.'));
  v.preload='metadata';v.muted=true;v.src=src;
 });
}
export async function submitLocalRecording(clipId,{isCurrent=()=>true,clip,activity,onSubmitted=()=>{}}={}){
 await sessionReady;
 if(!session.online||!session.user)return showAccountEntry({returnTo:'#reviews'});
 const actorId=session.user.id,actorEpoch=sessionEpoch;
 try{
  const catalog=await api('/catalog');
  if(!isCurrent()||!session.online||session.user?.id!==actorId||sessionEpoch!==actorEpoch)return false;
  return await uploadDialog(catalog,()=>{location.hash='reviews';if(currentMount?.container.isConnected)void mountOnline(...currentMount.args);},{clipId,isCurrent,clip,activity,onSubmitted});
 }catch(error){if(session.online&&session.user?.id===actorId&&sessionEpoch===actorEpoch)dialog('촬영 영상 제출',`<p>${esc(error.message)}</p><p>제출 화면을 다시 열어 시도해주세요.</p>`);}
}
async function uploadDialog(catalog,refresh,{clipId,isCurrent=()=>true,clip,activity,onSubmitted=()=>{}}={}){
 const directSubmission=!!document.querySelector('#app-shell');
 const actorId=session.user?.id,actorEpoch=sessionEpoch;
 const accountCurrent=()=>!!actorId&&session.online&&session.user?.id===actorId&&sessionEpoch===actorEpoch;
 let clips=[],localReadError='';
 try{clips=clip?[clip]:directSubmission&&!clipId?[]:await getClips();}catch(error){localReadError='기기 보관 영상을 불러오지 못했습니다. 다시 시도해주세요.';}
 if(!isCurrent()||!accountCurrent())return false;
 if(clipId&&localReadError){
  const notice=dialog('보관 영상 불러오기',`<p data-local-status role="alert">${localReadError}</p><button type="button" class="button primary" data-local-retry>다시 불러오기</button>`);
  const loaded=await new Promise(resolve=>{
   let reading=false;
   notice.addEventListener('close',()=>resolve(null));
   notice.querySelector('[data-local-retry]').onclick=async()=>{
    if(reading)return;
    if(!isCurrent()||!accountCurrent()||!notice.open||!notice.isConnected){notice.close();resolve(null);return;}
    reading=true;const button=notice.querySelector('[data-local-retry]');button.disabled=true;
    try{const result=await getClips();if(!isCurrent()||!accountCurrent()||!notice.open||!notice.isConnected){resolve(null);notice.close();return;}resolve(result);notice.close();}
    catch(error){if(notice.open&&accountCurrent()&&isCurrent())notice.querySelector('[data-local-status]').textContent=localReadError;else{resolve(null);notice.close();}}
    finally{reading=false;if(notice.open)button.disabled=false;}
   };
  });
  if(!loaded||!isCurrent()||!accountCurrent())return false;
  clips=loaded;localReadError='';
 }
 if(!actorId||!session.online||session.user?.id!==actorId||sessionEpoch!==actorEpoch)return;
 if(clip)clipId=clip.id;
 const inApp=directSubmission;
 const fileField=inApp?`<label class="ego-file-drop"><span class="ego-file-icon" aria-hidden="true">${uploadMark}</span><strong>제출할 영상을 선택하세요</strong><span class="ego-file-choose">파일 선택</span><input name="file" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov" aria-label="제출할 영상 파일 선택"><small>MOV·MP4·WebM · 최대 ${size(catalog.settings.maxVideoBytes)}</small></label>`:`<label>영상 선택<input name="file" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov"><small>MOV·MP4·WebM · 최대 ${size(catalog.settings.maxVideoBytes)}</small></label>`;
 const d=dialog('영상 제출',`${inApp?'<p class="ego-form-intro">촬영한 일상을<br>보내주세요</p>':''}<p class="online-help">${VIDEO_DURATION_HELP}</p><form class="online-form"><label>촬영 활동<select name="taskId" required>${catalog.tasks.map(t=>`<option value="${esc(t.id)}">${esc(t.title)} · 검수 통과 시 ${points(t.reward)}</option>`).join('')}</select></label><label>영상 제목<input name="title" required maxlength="120" placeholder="예: 주방 설거지"></label>${fileField}<div data-local-records ${directSubmission?'hidden':''}><label data-local-options ${clips.some(c=>c.blob)?'':'hidden'}>또는 내 기록에서 선택<select name="local"><option value="">선택 안 함</option>${clips.filter(c=>c.blob).map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}</select><small>기존 기록은 지워지지 않습니다.</small></label><p data-local-status role="alert">${localReadError}</p><button type="button" class="button" data-local-retry ${localReadError?'':'hidden'}>보관 영상 다시 불러오기</button></div>${inApp?'<div class="ego-file-card" data-file-card hidden><span class="ego-file-thumbnail" aria-hidden="true">'+uploadMark+'</span><div><strong data-file-name></strong><small data-file-size></small></div><button type="button" data-file-remove aria-label="선택한 영상 제외">×</button></div>':''}<section data-upload-consent>${inApp?'<h3 class="ego-form-intro">이용 범위를<br>확인해주세요</h3>':''}${consentFields}<p class="online-help">포인트는 최종 승인 후 적립됩니다.</p></section><ol class="online-upload-stages" aria-label="제출 진행 단계" hidden><li data-stage="transfer">1. 파일 전송</li><li data-stage="validation">2. 원본 확인</li><li data-stage="submission">3. 심사 접수</li></ol><progress class="online-progress" aria-label="서버에 전송된 영상 용량" max="100" value="0" hidden></progress>${statusLine}${inApp?'<div class="ego-form-actions"><button type="button" class="button" data-upload-cancel>취소</button>':''}<button type="submit" class="button primary">동의하고 제출</button>${inApp?'</div>':''}</form>`);
 if(inApp)d.classList.add('ego-form-sheet','ego-upload-sheet');
 const form=d.querySelector('form'),controller=new AbortController();let uploadId=null,completedVideoId=null,finished=false,transferring=false;
 if(clipId){const clip=clips.find(item=>item.id===clipId&&item.blob);if(!clip){d.close();throw Error('저장한 영상을 찾지 못했습니다. 보관한 영상을 확인해주세요.');}form.elements.local.value=clip.id;form.elements.title.value=clip.title;const taskId=clip.activityId||clip.missionId;if(catalog.tasks.some(task=>task.id===taskId))form.elements.taskId.value=taskId;else{const option=new Option('촬영 활동을 선택해주세요.','',true,true);option.disabled=true;form.elements.taskId.prepend(option);}}
 if(activity&&catalog.tasks.some(task=>task.id===activity.id)){form.elements.taskId.value=activity.id;form.elements.title.value=activity.title||'';}
 const updateFileCard=()=>{
  const card=form.querySelector('[data-file-card]');if(!card)return;
  const local=clips.find(item=>item.id===form.elements.local?.value),file=form.elements.file.files[0]||local?.blob;
  card.hidden=!file;
  if(file){card.querySelector('[data-file-name]').textContent=file.name||local?.title||'촬영 영상';card.querySelector('[data-file-size]').textContent=size(file.size);}
 };
 if(inApp){
  form.elements.file.addEventListener('change',()=>{if(form.elements.file.files.length&&form.elements.local)form.elements.local.value='';updateFileCard();});
  form.elements.local?.addEventListener('change',()=>{if(form.elements.local.value)form.elements.file.value='';updateFileCard();});
  form.querySelector('[data-file-remove]').onclick=()=>{if(transferring||completedVideoId)return;form.elements.file.value='';if(form.elements.local)form.elements.local.value='';updateFileCard();form.elements.file.focus();};
  form.querySelector('[data-upload-cancel]').onclick=()=>d.close();
  updateFileCard();
 }
 d.addEventListener('close',()=>{controller.abort();if(uploadId&&!finished)api('/uploads/'+uploadId,{method:'DELETE'}).catch(()=>{});});
 let readingLocal=false;
 const localRetry=form.querySelector('[data-local-retry]'),localStatus=form.querySelector('[data-local-status]');
 localRetry.onclick=async()=>{
  if(readingLocal||transferring||completedVideoId||!accountCurrent()||!d.open||!d.isConnected)return;
  readingLocal=true;localRetry.disabled=true;
  try{
   const next=await getClips();
   if(!accountCurrent()||!d.open||!d.isConnected||transferring||completedVideoId)return;
   const selected=form.elements.local.value;
   clips=next;
   form.querySelector('[data-local-options]').hidden=!clips.some(c=>c.blob);
   form.elements.local.innerHTML=`<option value="">선택 안 함</option>${clips.filter(c=>c.blob).map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}`;
   const selectionExists=clips.some(c=>c.id===selected&&c.blob);
   form.elements.local.value=selectionExists?selected:'';
   localStatus.textContent=selected&&!selectionExists?'선택한 보관 영상을 찾지 못했습니다. 파일이나 기록을 다시 선택해주세요.':'';
   localRetry.hidden=true;
  }catch(error){if(accountCurrent()&&d.open&&d.isConnected&&!transferring&&!completedVideoId)localStatus.textContent='기기 보관 영상을 불러오지 못했습니다. 다시 시도해주세요.';}
  finally{readingLocal=false;if(accountCurrent()&&d.open&&d.isConnected)localRetry.disabled=false;}
 };
 // Figma 137:3618 / 3658: selecting a file never submits it.
 if(inApp){
  const consentPanel=form.querySelector('[data-upload-consent]'),submitButton=form.querySelector('[type="submit"]');
  const next=document.createElement('button');next.type='button';next.className='button primary';next.textContent='이용 동의 확인';next.dataset.uploadContinue='';submitButton.before(next);
  const back=document.createElement('button');back.type='button';back.className='button';back.textContent='영상 선택으로';consentPanel.append(back);
  const selectionFields=[...form.children].filter(el=>el.matches('label,[data-local-records],[data-file-card]'));
  const selectionVisibility=new Map();
  const intro=d.querySelector('.ego-form-intro');
  const setConsentStep=active=>{
   d.dataset.uploadStep=active?'consent':'selection';d.querySelector('.online-dialog-head h2').textContent=active?'제출 전 동의':'영상 제출';
   if(active)selectionFields.forEach(el=>{selectionVisibility.set(el,el.hidden);el.hidden=true;});
   else selectionFields.forEach(el=>{if(selectionVisibility.has(el))el.hidden=selectionVisibility.get(el);});
   consentPanel.hidden=!active;submitButton.hidden=!active;next.hidden=active;intro.hidden=active;
   const durationHelp=d.querySelector('.online-dialog-body>.online-help');if(durationHelp)durationHelp.hidden=active;
  };
  setConsentStep(false);
  next.onclick=()=>{
   if(!accountCurrent()||!d.open||transferring)return;
   const local=clips.find(item=>item.id===form.elements.local.value);
   const status=form.querySelector('[role="status"]');
   if(!form.elements.file.files[0]&&!local?.blob){status.textContent='제출할 영상 파일을 선택해주세요.';return;}
   if(!form.elements.taskId.reportValidity()||!form.elements.title.reportValidity())return;
   status.textContent='';setConsentStep(true);d.querySelector('.online-dialog-body').scrollTop=0;consentPanel.querySelector('input')?.focus({preventScroll:true});
  };
  back.onclick=()=>{if(!transferring&&!completedVideoId)setConsentStep(false);};
 }
 const stage=name=>{d.dataset.uploadStage=name;if(inApp){d.querySelector('.online-dialog-head h2').textContent={transfer:'영상 전송',validation:'원본 확인',submission:'심사 접수'}[name];d.querySelector('.online-dialog-body').scrollTop=0;}form.querySelectorAll('[data-upload-consent]>label,[data-upload-consent]>p,[data-upload-consent]>button').forEach(el=>el.hidden=true);form.querySelector('[type="submit"]').textContent={transfer:'전송 중',validation:'확인 중',submission:'접수 중'}[name];const heading=d.querySelector('[data-upload-consent] .ego-form-intro');if(heading)heading.textContent={transfer:'영상을 보내고 있어요',validation:'원본을 확인하고 있어요',submission:'심사를 접수하고 있어요'}[name];if(inApp&&!form.querySelector('[data-upload-visual]'))heading.insertAdjacentHTML('afterend','<div class="ego-transfer-visual" data-upload-visual aria-hidden="true"><img src="/app/assets/figma-forms/mascot.png" alt=""></div>');form.querySelector('.online-upload-stages').hidden=false;form.querySelectorAll('[data-stage]').forEach(item=>{if(item.dataset.stage===name)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});};
 form.onsubmit=async e=>{e.preventDefault();if(finished||transferring)return;transferring=true;busy(form,true);if(inApp)form.querySelector('[data-file-remove]').disabled=true;const status=form.querySelector('[role="status"]'),progress=form.querySelector('progress');try{
  const consent=readConsent(form);
  if(!completedVideoId){
   const values=new FormData(form),local=clips.find(c=>c.id===values.get('local')),selectedFile=form.elements.file.files[0],file=selectedFile||local?.blob;if(!file)throw Error('제출할 영상 파일을 선택해주세요.');if(file.size>catalog.settings.maxVideoBytes)throw Error('파일 용량이 업로드 한도를 초과했습니다.');if(inApp)form.querySelectorAll('[name="file"],[name="local"]').forEach(input=>input.disabled=true);status.textContent='영상 파일 정보를 확인하고 있습니다.';const meta=await metadata(file),{mime,filename}=await uploadFileInfo(file,local?.title||'촬영 영상');
   assertVideoDuration(meta.duration);
   const upload=await api('/uploads',{method:'POST',body:{...meta,title:values.get('title'),taskId:values.get('taskId'),filename,size:file.size,mime},signal:controller.signal});uploadId=upload.id;stage('transfer');progress.hidden=false;progress.max=file.size;progress.value=0;let offset=0;
   status.textContent=`파일 전송 중 · 0% · ${size(0)} / ${size(file.size)}. 이 창을 닫으면 전송이 중단됩니다.`;
   while(offset<file.size){const result=await api(`/uploads/${uploadId}?offset=${offset}`,{method:'PUT',raw:file.slice(offset,offset+upload.chunkSize),signal:controller.signal});if(!Number.isInteger(result.offset)||result.offset<=offset||result.offset>file.size)throw Error('전송된 영상 용량을 확인하지 못했습니다. 다시 제출해주세요.');offset=result.offset;progress.value=offset;status.textContent=`파일 전송 중 · ${Math.floor(offset/file.size*100)}% · ${size(offset)} / ${size(file.size)}`;}
   stage('validation');status.textContent='전송 완료 · 서버에서 원본 영상을 확인하고 있습니다.';const complete=await api(`/uploads/${uploadId}/complete`,{method:'POST',body:{},signal:controller.signal});completedVideoId=complete.id;uploadId=null;
  }
  stage('submission');status.textContent='원본 확인 완료 · 동의 내용을 저장하고 심사를 접수하고 있습니다.';
  const submission=await api(`/videos/${completedVideoId}/submit`,{method:'POST',body:consent,signal:controller.signal});finished=true;onSubmitted();if(!d.isConnected)return;
  const video=submission?.video,task=submission?.task,hasDetails=video?.id===completedVideoId&&video.status==='submitted'&&typeof video.title==='string'&&typeof task?.title==='string'&&Number.isSafeInteger(video.reward)&&video.reward>=0;
  d.querySelector('.online-dialog-body').innerHTML=`<section class="online-receipt" data-submission-receipt>${inApp?'<div class="ego-receipt-hero">':'<span class="online-badge status-submitted">접수 완료</span>'}<h3 tabindex="-1">일상을 보내주셔서<br>고마워요</h3>${inApp?'<p>영상의 심사를 접수했어요.</p><div class="ego-form-mascot-stage"><span><img class="ego-form-mascot" src="/app/assets/figma-forms/mascot.png" alt=""></span></div></div>':''}${hasDetails?`<dl><div><dt>영상</dt><dd>${esc(video.title)}</dd></div><div><dt>촬영 활동</dt><dd>${esc(task.title)}</dd></div><div><dt>심사 상태</dt><dd>승인 대기</dd></div><div><dt>승인 시 포인트</dt><dd>${points(video.reward)}</dd></div></dl>`:'<p>접수는 완료되었습니다. 영상과 포인트의 상세 정보는 제출·심사 내역에서 확인해주세요.</p>'}<p>아직 포인트가 적립되지 않았습니다. 검수 승인 후 내 포인트에 반영됩니다.</p><button type="button" class="button primary" data-go-history>제출·심사 내역 보기</button></section>`;
  if(inApp){d.dataset.uploadStage='receipt';d.querySelector('.online-dialog-head h2').textContent='심사 접수 완료';d.querySelector('.online-dialog-body').scrollTop=0;}
  d.querySelector('h3').focus({preventScroll:true});d.querySelector('[data-go-history]').onclick=()=>{d.close();location.hash='reviews';if(currentMount?.args[0]==='reviews')void refresh();};
 }catch(e){if(e.name!=='AbortError'){d.dataset.uploadStage='error';if(inApp){d.querySelector('.online-dialog-head h2').textContent='제출 확인 필요';d.querySelector('.online-dialog-body').scrollTop=0;}form.querySelectorAll('[data-upload-consent]>label,[data-upload-consent]>p').forEach(el=>el.hidden=false);const selectionBack=form.querySelector('[data-upload-consent]>button');if(selectionBack)selectionBack.hidden=!!completedVideoId;form.querySelector('[type="submit"]').textContent='다시 제출하기';const heading=d.querySelector('[data-upload-consent] .ego-form-intro');if(heading)heading.innerHTML='제출 결과를<br>확인해주세요';status.textContent=completedVideoId?`원본 전송은 완료되었지만 심사 접수에 실패했습니다. ${e.message} 같은 원본으로 다시 요청하거나 제출·심사 내역에서 이어서 제출하세요.`:e.message;if(completedVideoId){form.querySelectorAll('[name="taskId"],[name="title"],[name="file"],[name="local"]').forEach(input=>input.disabled=true);form.querySelector('[type="submit"]').textContent='같은 원본으로 심사 접수 재시도';}}if(uploadId){await api('/uploads/'+uploadId,{method:'DELETE'}).catch(()=>{});uploadId=null;}}finally{transferring=false;busy(form,false);if(inApp&&!completedVideoId)form.querySelectorAll('[name="file"],[name="local"],[data-file-remove]').forEach(input=>input.disabled=false);}};

 return true;
}
function videoDeletionDialog(video){
 const subject=`제출 영상 삭제 요청 · ${video.id}`;
 const body=`영상 제목: ${video.title}\n영상 ID: ${video.id}\n요청 내용: 제출한 영상의 삭제를 요청합니다.`;
 const mail=`mailto:${esc(supportEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
 if(!document.querySelector('#app-shell')){dialog('영상 삭제 요청',`<h3 class="ego-form-intro">제출한 영상의<br>삭제를 요청할 수 있어요</h3><p>${esc(video.title)}</p><p>삭제할 영상을 찾을 수 있도록 영상 제목과 요청 내용을 함께 보내주세요.</p><p class="online-help">요청을 보내는 것만으로 삭제가 완료되지는 않습니다. 처리 결과를 별도로 안내합니다. 기기 보관 영상 삭제와 서버 제출 영상 삭제는 별개입니다.</p><p>${esc(supportEmail)}</p><a class="button primary" href="${mail}">삭제 요청 문의 작성</a>`);return;}
 const d=dialog('영상 삭제·동의 철회',`<h3 class="ego-review-heading">제출한 영상의<br>삭제를 요청할 수 있어요</h3><section class="ego-form-card"><h4>제출한 영상</h4><p>제출 경로, 영상 제목, 요청 내용을 문의에 남겨주세요. 요청 접수와 실제 삭제 완료는 구분됩니다.</p><p class="ego-review-file-title">${esc(video.title)}</p></section><section class="ego-form-card"><h4>이 기기에 보관한 영상</h4><p>제출하지 않은 보관 영상은 직접 삭제할 수 있어요. 이미 내려받은 파일도 따로 삭제해주세요.</p></section><p class="ego-review-note">제출한 영상의 처리 상태는 영상 내역에서 확인해주세요.</p><a class="ego-review-row" href="${mail}"><strong>이메일 문의</strong><small>${esc(supportEmail)}</small></a><div class="ego-review-bottom"><a class="button primary" href="${mail}">삭제 요청 문의 작성</a><button type="button" class="button" data-delete-back>돌아가기</button></div>`);
 if(document.querySelector('#app-shell'))d.classList.add('ego-video-deletion');
 d.querySelector('[data-delete-back]').onclick=()=>d.close();
}
export async function viewVideo(id){
 const inApp=!!document.querySelector('#app-shell'),d=dialog(inApp?'영상 상세':'영상과 심사 기록','<p role="status">불러오는 중입니다.</p>',{wide:true});
 try{
 const data=await api(`/videos/${id}`),video=data.video,playable=!['deleting','deleted'].includes(video.status);
 const playback=playable&&isNativeApp()?await api(`/videos/${id}/playback`,{method:'POST',body:{}}):null;
 if(!d.isConnected||!d.open)return;
 const mediaURL=playback?.url||`/api/videos/${encodeURIComponent(id)}/file`;
 if(playback&&!(new URL(mediaURL).origin==='https://60base.ai'&&new URL(mediaURL).pathname===`/api/videos/${encodeURIComponent(id)}/file`))throw Error('영상 주소를 확인하지 못했습니다.');
 if(inApp){
 d.classList.add('ego-review-detail');d.dataset.reviewStatus=video.status;
 d.querySelector('.online-dialog-head h2').textContent=video.status==='approved'?'승인된 영상':video.status==='rejected'?'보완이 필요한 영상':'영상 상세';
 const approved=video.status==='approved',rejected=video.status==='rejected',pending=['submitted','reviewing'].includes(video.status),reason=video.reason||data.reviews.filter(r=>r.decision==='rejected').at(-1)?.reason;
 const history=`<section class="ego-review-row"><strong>심사 기록</strong>${data.reviews.length?`<ol class="ego-review-history">${data.reviews.map(r=>`<li><small>${r.revision}차 제출 · ${date(r.createdAt)}</small>${badge(r.decision)}<p>${esc(r.reason||'등록된 검수 기준으로 확인했습니다.')}</p></li>`).join('')}</ol>`:'<small>아직 심사 결과가 없어요.</small>'}</section>`;
 d.querySelector('.online-dialog-body').innerHTML=`${playable?`<video class="ego-review-video" src="${esc(mediaURL)}" controls playsinline preload="metadata"></video><p class="ego-review-caption">${esc(video.title)} · ${Math.round(video.duration)}초 · ${size(video.size)}</p>`:'<p class="online-notice">영상 삭제 요청이 반영되었습니다. 처리 상태는 내역에서 확인해주세요.</p>'}${approved?`<section class="ego-review-reward"><h3>일상이 기여가 되었어요</h3><strong>${points(video.reward)}</strong><p>최종 심사를 통과한 영상이에요.</p><div class="ego-form-mascot-stage"><span><img class="ego-form-mascot" src="/app/assets/figma-forms/mascot.png" alt=""></span></div></section>`:`<h3 class="ego-review-heading">${pending?'꼼꼼히 확인하고 있어요':rejected?'조금 더 확인이 필요해요':'영상과 심사 기록'}</h3><p class="ego-review-status">${badge(video.status)}</p>${pending?`<ol class="ego-review-progress" aria-label="심사 진행"><li>접수</li><li aria-current="step">검토</li><li>결과</li></ol><section class="ego-review-pending"><h4>승인 시 예상 포인트</h4><p>최종 승인 후 적립됩니다.</p><strong>${points(video.reward)}</strong><small>현재 잔액에 미포함</small></section>`:rejected?`<p class="ego-review-reason">${esc(reason||'심사 기록에서 보완 요청 내용을 확인해주세요.')}</p><section class="ego-form-card"><h4>다음 제출 전 확인</h4><p>손과 작업 대상이 보이도록 가로 화면으로 촬영해주세요.</p></section><p class="ego-review-note">이 영상은 아직 포인트가 적립되지 않았어요.</p>`:videoPoints(video)}`}${rejected?`<button type="button" class="ego-review-row" data-app-action="resubmit" data-id="${esc(video.id)}" data-detail-action><strong>같은 영상으로 다시 심사받기</strong><small>원본을 다시 확인하고 동의해 요청하세요.</small></button>`:history}${video.status==='uploaded'?`<button type="button" class="button" data-app-action="resubmit" data-id="${esc(video.id)}" data-detail-action>동의하고 제출</button>`:''}<button type="button" class="ego-review-row" data-video-delete-request><strong>영상 삭제·동의 철회 요청</strong><small>요청 내용은 운영팀에서 확인해요.</small></button>${rejected?history:''}<div class="ego-review-bottom">${rejected?'<button type="button" class="button primary" data-app-action="submit-video" data-detail-action>수정 영상 제출</button>':`<a class="button primary" href="${approved?'#wallet':'#reviews'}" data-detail-return>${approved?'포인트 확인하기':'제출 내역으로'}</a>`}</div>`;
 }else d.querySelector('.online-dialog-body').innerHTML=`${['deleting','deleted'].includes(data.video.status)?'<p class="online-notice">영상 삭제 요청이 반영되었습니다. 처리 상태는 내역에서 확인해주세요.</p>':`<video src="${esc(mediaURL)}" controls playsinline preload="metadata"></video>`}<h3 class="ego-form-intro">${esc(({submitted:"꼼꼼히 확인하고 있어요",reviewing:"꼼꼼히 확인하고 있어요",approved:"일상이 기여가 되었어요",rejected:"조금 더 확인이 필요해요"})[data.video.status]||"영상과 심사 기록")}</h3><h3>${esc(data.video.title)}</h3><p>${badge(data.video.status)} · ${Math.round(data.video.duration)}초 · ${size(data.video.size)}</p>${videoPoints(data.video)}<h3>심사 기록</h3>${data.reviews.length?`<ol class="online-history">${data.reviews.map(r=>`<li>${badge(r.decision)}<p>${date(r.createdAt)} · ${r.revision}차 제출</p><p>${esc(r.reason||'등록된 검수 기준으로 확인했습니다.')}</p></li>`).join('')}</ol>`:'<p>아직 심사 결과가 없습니다.</p>'}${document.querySelector("#app-shell")&&["uploaded","rejected"].includes(data.video.status)?`<button type="button" class="button primary" data-app-action="resubmit" data-id="${esc(data.video.id)}" data-detail-action>${data.video.status==="uploaded"?"동의하고 제출":"같은 영상 재검토"}</button>${data.video.status==="rejected"?'<button type="button" class="button" data-app-action="submit-video" data-detail-action>수정 영상 제출</button>':""}`:""}<button type="button" class="button" data-video-delete-request>영상 삭제·동의 철회 요청</button><a class="button primary" href="${data.video.status==='approved'?'#wallet':'#reviews'}" data-detail-return>${data.video.status==='approved'?'포인트 확인하기':'제출 내역으로'}</a>`;
 d.querySelector('[data-video-delete-request]').onclick=()=>{d.close();videoDeletionDialog(video);};
 d.querySelectorAll('[data-detail-return],[data-detail-action]').forEach(button=>button.onclick=()=>d.close());
 }catch(e){if(d.isConnected&&d.open)d.querySelector('.online-dialog-body').textContent=e.message;}
}
function readConsent(form){const result=Object.fromEntries(['filming','privacy','usage','training','recordedInKorea'].map(k=>[k,form.elements[k].checked]));if(Object.values(result).some(v=>!v))throw Error('촬영·개인정보·이용 동의, 교육 확인과 대한민국 내 촬영 확인을 완료해주세요.');return result;}
export function resubmit(id,refresh){
 const actorId=session.user?.id,actorEpoch=sessionEpoch,idempotencyKey=crypto.randomUUID();
 const inApp=!!document.querySelector('#app-shell');
 const d=dialog(inApp?'같은 영상 재검토':'심사 요청',`<form class="online-form ego-resubmit-form"><h3 class="ego-form-intro">원본과 동의를<br>다시 확인해주세요</h3><p class="ego-resubmit-description">대한민국 내에서 직접 촬영한 원본인지 확인해주세요.</p>${consentFields}${inApp?'<a class="ego-form-row" href="/studio/privacy.html" target="_blank" rel="noopener"><strong>영상 이용 범위</strong><small>개인정보 안내에서 확인하세요.</small></a>':''}<p class="ego-resubmit-note">포인트는 검수 승인 후 적립됩니다.</p>${statusLine}<button type="submit" class="button primary">확인하고 요청</button></form>`),form=d.querySelector('form');
 if(inApp)d.classList.add('ego-resubmit-page');
 const current=()=>!!actorId&&d.isConnected&&d.open&&session.online&&session.user?.id===actorId&&sessionEpoch===actorEpoch;
 let expectedRevision,inFlight=false;busy(form,true);
 const ready=(current()?api(`/videos/${id}`):Promise.resolve()).then(detail=>{if(current()){expectedRevision=detail?.video?.revision;if(!Number.isInteger(expectedRevision))throw Error('제출 회차를 확인하지 못했습니다.');busy(form,false);}}).catch(error=>{if(current())form.querySelector('[role="status"]').textContent=error.message;});
 form.onsubmit=async e=>{e.preventDefault();if(inFlight)return;inFlight=true;await ready;if(!current()||!Number.isInteger(expectedRevision)){inFlight=false;return;}busy(form,true);try{
  await api(`/videos/${id}/submit`,{method:'POST',body:{...readConsent(form),idempotencyKey,expectedRevision}});
  if(!current())return;
  window.dispatchEvent(new CustomEvent('service-submission',{detail:{userId:actorId,epoch:actorEpoch}}));d.close();refresh();
 }catch(error){if(current())form.querySelector('[role="status"]').textContent=error.message;}finally{inFlight=false;if(current())busy(form,false);}};
 return d;
}
function wallet(container,me){
 const pendingVideos=me.videos.filter(v=>['submitted','reviewing'].includes(v.status)),pendingPoints=pendingVideos.reduce((sum,v)=>sum+(Number(v.reward)||0),0);
 container.innerHTML=`<div class="online-toolbar"><div><h2>내 포인트</h2><p>대한민국의 일상을 담은 영상, 검수 승인 후 포인트로 적립됩니다.</p></div></div><div class="online-kpis online-points-kpis"><div class="online-kpi online-points-balance"><span>보유 포인트</span><strong data-points-balance>${points(me.wallet.available)}</strong><small>실제 적립·사용 내역이 반영된 잔액</small></div><div class="online-kpi"><span>승인 대기 예상 포인트</span><strong data-pending-points>${points(pendingPoints)}</strong><small>${pendingVideos.length}개 영상 · 보유 포인트에 포함되지 않습니다.</small></div><div class="online-kpi"><span>누적 적립 포인트</span><strong>${points(me.wallet.earned)}</strong><small>승인된 영상의 누적 보상</small></div></div><div class="online-split"><section class="online-panel"><h3>포인트 내역</h3>${me.ledger.length?me.ledger.map(l=>`<article class="online-item"><div><strong>${esc({reward:'영상 승인 포인트',purchase:'포인트 사용',refund:'사용 취소 반환'}[l.kind]||l.kind)}</strong><p>${date(l.createdAt)}</p></div><strong>${points(l.amount)}</strong></article>`).join(''):'<p class="online-help">아직 적립된 포인트가 없습니다. 영상이 승인되면 실제 적립 내역이 표시됩니다.</p>'}<a class="button" href="#reviews">제출·심사 내역 보기</a></section><section class="online-panel online-bank-planned" aria-labelledby="online-bank-title"><span class="online-badge">준비 중</span><h3 id="online-bank-title">국내 은행 연동 예정</h3><p id="online-bank-help">현재는 포인트 적립만 운영합니다. 은행 계좌 등록, 출금과 포인트 사용은 아직 제공하지 않습니다.</p><div class="online-form" aria-describedby="online-bank-help"><label>은행<select name="bank" disabled><option>국내 은행 연동 예정</option></select></label><label>예금주<input name="holder" disabled placeholder="연동 후 이용 가능"></label><label>계좌번호<input name="number" disabled placeholder="연동 후 이용 가능"></label><button type="button" class="button" disabled>은행 계좌 연결 · 준비 중</button><button type="button" class="button primary" disabled>출금 신청 · 준비 중</button></div></section></div>${me.payouts.length?`<section class="online-panel"><h3>기존 출금 기록</h3><p class="online-help">과거 기록은 조회만 가능합니다.</p>${me.payouts.map(p=>`<article class="online-item"><div>${badge(p.status)}<p>${date(p.createdAt)}${p.note?' · '+esc(p.note):''}</p></div><strong>${money(p.amount)}</strong></article>`).join('')}</section>`:''}`;
}
function shop(container,me,catalog,refresh){
 container.innerHTML=`<div class="online-toolbar"><div><h2>촬영 장비와 주문</h2><p>필요한 장비를 확인하고 주문 상태를 살펴보세요.</p></div></div><div class="online-notice">현재는 포인트 적립만 운영합니다. 상품 주문과 포인트 사용은 준비 중입니다.</div><div class="online-list">${catalog.products.length?catalog.products.map(p=>`<article class="online-item"><div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><strong>${money(p.price)}</strong> <span class="online-help">${p.stock>0?'주문 준비 중':'품절'}</span></div><button type="button" class="button primary" data-order="${esc(p.id)}" disabled>주문하기</button></article>`).join(''):empty('등록된 상품이 없습니다.','촬영 장비가 준비되면 이곳에서 안내합니다.')}</div><section class="online-panel" style="margin-top:24px"><h3>내 주문</h3>${me.orders.length?me.orders.map(o=>`<article class="online-item"><div><h4>${o.items.map(i=>esc(i.title)+' × '+i.quantity).join(', ')}</h4><p>${date(o.createdAt)} · ${money(o.total)}</p>${badge(o.status)}${o.reference?`<p>확인번호 ${esc(o.reference)}</p>`:''}</div></article>`).join(''):'<p class="online-help">아직 주문 내역이 없습니다.</p>'}</section>`;

}
function support(container,me,refresh){container.innerHTML=`<div class="online-toolbar">${document.querySelector('#app-shell')?'':'<div><h2>문의와 도움</h2><p>영상, 심사, 계정, 정산 관련 문의를 남겨주세요.</p></div>'}<button type="button" class="button primary" data-new-ticket>문의 작성</button></div>${me.tickets.length?`<div class="online-list">${me.tickets.map(t=>`<article class="online-panel">${badge(t.status)}<h3>${esc(t.subject)}</h3><p>${esc(t.message)}</p><p class="online-help">${date(t.createdAt)}</p>${t.response?`<div class="online-notice"><strong>운영자 답변</strong>${esc(t.response)}</div>`:''}</article>`).join('')}</div>`:empty('아직 문의 내역이 없습니다.','영상 삭제·동의 철회와 계정 관련 요청도 이곳에서 접수할 수 있습니다.')}`;container.querySelector('[data-new-ticket]').onclick=()=>{const d=dialog('문의 작성',`<form class="online-form"><label>제목<input name="subject" required maxlength="120"></label><label>문의 내용<textarea name="message" required maxlength="5000" rows="6"></textarea></label>${document.querySelector('#app-shell')?'<p class="ego-form-description">제목은 120자, 문의 내용은 5,000자까지 입력할 수 있어요.</p><p class="ego-form-description">삭제·동의 철회 요청도 이곳에서 접수할 수 있습니다.</p>':''}${statusLine}<button type="submit" class="button primary">문의 보내기</button></form>`),form=d.querySelector('form');form.onsubmit=async e=>{e.preventDefault();busy(form,true);try{await api('/tickets',{method:'POST',body:Object.fromEntries(new FormData(form))});d.close();refresh();}catch(e){form.querySelector('[role="status"]').textContent=e.message;}finally{busy(form,false);}};};}

export async function enhanceOnlineShell(route,main){
 if(!main.querySelector('.online-support-faq')){releaseSupportFaq();releaseSupportFaq=()=>{};}
 await sessionReady;if(location.hash.slice(1)!==route&&!(route==='home'&&!location.hash))return;
 if(requiresStudioAccount(route)&&(getStudioAccess()!=='allowed'||main.dataset.access!=='allowed'))return;
 syncAccountShell();
 const profileNote=main.querySelector('[data-profile-offline-note]');if(profileNote)profileNote.hidden=session.online;
 if(!session.online&&route==='profile')cloudProfile(main);
 if(!session.online)return;
 main.querySelectorAll('[data-action="collection-submit"],[data-action="collection-apply"]').forEach(b=>{b.dataset.action='online-submit';b.textContent='영상 제출하기';});
 if(['home','library','missions','profile'].includes(route)){
  const id='online-route-bridge';main.querySelector('#'+id)?.remove();
  const copy={home:['영상 제출부터 심사 결과까지','촬영을 마쳤다면 제출하고 진행 상태를 확인하세요.'],library:['이 브라우저에 보관한 영상','서버에 보낸 영상은 제출·심사 내역에서 확인할 수 있습니다.'],missions:['현재 접수 중인 촬영 활동','활동별 촬영 조건과 보상은 제출 화면에서 확인하세요.'],profile:['로그인 계정','계정 이름과 비밀번호는 계정 관리에서 변경할 수 있습니다.']}[route];
  const box=document.createElement('section');box.id=id;box.className='online-panel online-route-bridge';box.innerHTML=`<div><h2>${copy[0]}</h2><p>${route==='profile'&&session.user?esc(session.user.email):copy[1]}</p></div><div class="online-toolbar-actions"><button type="button" class="button primary" ${route==='profile'?'data-online-account':'data-online-submit'}>${route==='profile'?'계정 관리':'영상 제출'}</button><a class="button" href="#reviews">제출·심사 내역</a></div>`;
  main.prepend(box);
 }
}
document.addEventListener('click',async e=>{
 const online=e.target.closest('[data-online-submit],[data-action="online-submit"]');
 const account=e.target.closest('[data-action="account-entry"],[data-action="account-entry-panel"],[data-action="identity-entry"],[data-action="earnings-entry"]');
 if(account){e.preventDefault();e.stopImmediatePropagation();void showAccountEntry();return;}
 if(!online)return;e.preventDefault();e.stopImmediatePropagation();if(!session.online){dialog('제출 안내',submissionGuide(),{wide:true});return;}if(!session.user){void showAccountEntry({returnTo:'#reviews'});return;}
 const actorId=session.user.id,actorEpoch=sessionEpoch;
 try{const catalog=await api('/catalog');if(!session.online||session.user?.id!==actorId||sessionEpoch!==actorEpoch)return;await uploadDialog(catalog,()=>{location.hash='reviews';if(currentMount?.container.isConnected)void mountOnline(...currentMount.args);});}catch(error){if(!session.online||session.user?.id!==actorId||sessionEpoch!==actorEpoch)return;dialog('영상 제출',`<p>${esc(error.message)}</p>`);}
},true);
