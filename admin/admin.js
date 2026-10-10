import {icon} from '../shared/ui.js';
import {api as requestApi,session,sessionReady,refreshSession,showAccount,dialog as baseDialog,esc,money,points,date,size,badge,statusLine,busy,labels} from '../studio/online-api.js';
const pages=[['overview','대시보드','grid'],['members','회원 관리','user'],['videos','영상·심사','video'],['tasks','촬영 활동','book'],['data','데이터 현황','folder'],['finance','매출·비용','wallet'],['payouts','출금 관리','bank'],['commerce','상품·주문','package'],['tickets','문의 관리','help'],['notices','공지 관리','bell'],['audit','변경 기록','clock'],['settings','운영 설정','settings']];
const state={data:null,overview:null,days:30,epoch:0,accessVersion:0,loadedRoute:null,commerce:'orders',filters:{query:'',status:'all'},sort:{scope:null,index:null,direction:'asc'}},main=document.querySelector('#admin-main');
let sessionRecovery=null;
let cloudAccount=null,cloudInitialization=null,googlePending=false,googlePopup=false,googleBridge=false,adminSigningOut=false,googleMessage='';
function syncAdminGoogle(){
 const cloud=cloudAccount?.getCloudAccount(),waiting=googlePending||googlePopup||googleBridge||cloud?.busy;
 const ready=cloud?.availability==='ready'&&!waiting;
 document.querySelectorAll('[data-google-signin]').forEach(button=>{button.disabled=!session.online||!ready;button.setAttribute('aria-busy',String(!!waiting));button.querySelector('span').textContent=waiting?'Google 로그인 중…':'Google로 로그인';});
 if(!session.user&&session.authProvider==='google')document.querySelector('#admin-account').disabled=!session.online||!ready;
 const status=document.querySelector('[data-admin-auth-status]');
 if(status)status.textContent=googleMessage||(waiting?'Google 계정을 확인하고 있습니다.':!cloud||cloud.availability==='loading'?'Google 로그인을 준비하고 있습니다.':cloud.availability!=='ready'?'Google 로그인에 연결하지 못했습니다. 다시 연결해주세요.':'');
 const retry=document.querySelector('[data-google-retry]');if(retry)retry.hidden=!!waiting||(!cloudInitialization&&cloud?.availability==='ready');
 const registration=document.querySelector('[data-admin-registration]');if(registration)registration.hidden=cloud?.phase!=='registrationRequired';
}
function googleLoginError(error){
 return {'auth/popup-closed-by-user':'로그인 창이 닫혔습니다. 다시 시도해주세요.','auth/cancelled-popup-request':'이미 열린 Google 로그인 창에서 계속해주세요.','auth/popup-blocked':'브라우저에서 팝업을 허용한 뒤 다시 시도해주세요.','auth/network-request-failed':'인터넷 연결을 확인한 뒤 다시 시도해주세요.'}[error?.code]||error?.message||'Google 로그인을 완료하지 못했습니다. 다시 시도해주세요.';
}
async function initializeAdminGoogle(){
 if(cloudInitialization)return cloudInitialization;
 cloudInitialization=(async()=>{
  try{
   if(!cloudAccount){
    cloudAccount=await import('../studio/cloud-account.js');
    cloudAccount.subscribeCloudAccount(()=>{syncAdminGoogle();void finishAdminGoogle();});
   }else await cloudAccount.retryCloudAccount();
  }catch{googleMessage='Google 로그인에 연결하지 못했습니다. 다시 연결해주세요.';}
  finally{cloudInitialization=null;syncAdminGoogle();}
 })();
 return cloudInitialization;
}
function signInAdminGoogle(){
 const cloud=cloudAccount?.getCloudAccount();
 if(!session.online||session.user||cloud?.availability!=='ready'||cloud.busy||googlePending||googlePopup||googleBridge)return;
 googlePending=true;googlePopup=true;googleMessage='';
 // Invoke the provider directly in the click handler to preserve popup activation.
 let popup;try{popup=cloudAccount.continueWithGoogle();}catch(error){popup=Promise.reject(error);}
 syncAdminGoogle();
 Promise.resolve(popup).catch(error=>{googlePending=false;googleMessage=googleLoginError(error);}).finally(()=>{googlePopup=false;void finishAdminGoogle();syncAdminGoogle();});
}
async function finishAdminGoogle(){
 const cloud=cloudAccount?.getCloudAccount();
 if(!googlePending||googlePopup||googleBridge||adminSigningOut||cloud?.busy)return;
 if(cloud?.availability!=='ready'||cloud.error){googlePending=false;googleMessage=googleLoginError(cloud?.error);syncAdminGoogle();return;}
 if(cloud.phase==='signedOut'){googlePending=false;googleMessage='Google 로그인이 취소되었습니다. 다시 시도해주세요.';syncAdminGoogle();return;}
 if(cloud.phase==='registrationRequired'){googlePending=false;googleMessage='이 계정은 Studio 가입 확인이 필요합니다. 관리자에게 연결된 Google 계정을 선택해주세요.';syncAdminGoogle();return;}
 if(cloud.phase!=='registered'||!cloud.user)return;
 googlePending=false;googleBridge=true;syncAdminGoogle();
 const uid=cloud.user.uid,version=state.accessVersion;
 const current=()=>cloudAccount.getCloudAccount().user?.uid===uid&&cloudAccount.getCloudAccount().phase==='registered'&&state.accessVersion===version&&!session.user;
 try{
  const idToken=await cloudAccount.getCloudIdToken();
  if(!current())throw Error('로그인 계정이 변경되었습니다. 다시 시도해주세요.');
  const result=await requestApi('/auth/firebase',{method:'POST',body:{idToken}});
  if(!current()){
   // The exchange already issued a cookie. Revoke it without publishing the stale user.
   const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':result.csrf}});
   if(!response.ok)throw Error('변경된 계정의 로그인을 취소하지 못했습니다. 연결을 확인한 뒤 다시 로그인해주세요.');
   await refreshSession();
   throw Error('로그인 계정이 변경되었습니다. 다시 시도해주세요.');
  }
  await refreshSession();
  if(!session.online)throw Error('로그인 상태를 확인하지 못했습니다. 연결을 확인하고 다시 시도해주세요.');
  if(!session.user)throw Error('로그인 세션을 확인하지 못했습니다. 다시 시도해주세요.');
  googleMessage='';
 }catch(error){googleMessage=googleLoginError(error);}
 finally{googleBridge=false;syncAdminGoogle();}
}
async function signOutAdmin(){
 if(adminSigningOut)return;
 adminSigningOut=true;googlePending=false;googleMessage='';
 try{
  await requestApi('/auth/logout',{method:'POST'});await refreshSession();
  if(cloudAccount?.getCloudAccount().user)await cloudAccount.signOutCloudAccount();
 }finally{adminSigningOut=false;syncAdminGoogle();}
}
const route=()=>pages.some(p=>p[0]===location.hash.slice(1))?location.hash.slice(1):'overview';
const canManage=()=>session.online&&session.user?.role==='admin'&&!session.user.forcePassword;
function closeAdminDialogs(){
 document.querySelectorAll(canManage()?'dialog[data-admin-private]':'dialog.online-dialog').forEach(element=>{
  element.querySelectorAll('video').forEach(video=>{video.pause();video.removeAttribute('src');video.load();});
  element.close();element.remove();
 });
}
function clearAdminData(){state.data=null;state.overview=null;state.loadedRoute=null;document.querySelector('#admin-last-update').textContent='';}
function dialog(title,content,options){const element=baseDialog(title,content,options);element.dataset.adminPrivate='';return element;}
function showLoadError(message){
 main.removeAttribute('aria-busy');
 main.innerHTML=`<section class="online-panel"><h2>운영 데이터를 불러오지 못했습니다.</h2><p>${esc(message)}</p><button type="button" class="button" data-retry>다시 확인</button></section>`;
 main.querySelector('[data-retry]').onclick=load;
}
async function recoverAdminSession(){
 if(sessionRecovery)return sessionRecovery;
 state.accessVersion++;state.epoch++;clearAdminData();closeAdminDialogs();
 main.innerHTML='<p role="status">로그인 상태를 확인하고 있습니다.</p>';
 sessionRecovery=refreshSession();
 try{await sessionRecovery;if(!gate())showLoadError('계정 상태를 확인했습니다. 다시 불러와 주세요.');}
 finally{sessionRecovery=null;}
}
async function api(path,options){
 const version=state.accessVersion,userId=session.user?.id;
 try{
  const result=await requestApi(path,options);
  if(version!==state.accessVersion||userId!==session.user?.id||!canManage())throw new DOMException('계정 상태가 변경되었습니다.','AbortError');
  return result;
 }catch(error){
  if(version!==state.accessVersion||userId!==session.user?.id)throw new DOMException('계정 상태가 변경되었습니다.','AbortError');
  if(error.status===401||error.status===403)await recoverAdminSession();
  throw error;
 }
}
const navigationGroups=[['운영',['overview','videos','tasks','data']],['참여자',['members','tickets','notices']],['관리',['finance','payouts','commerce']],['설정',['audit','settings']]];
document.querySelector('#admin-nav').innerHTML=navigationGroups.map(([group,ids])=>`<div class="admin-nav-group"><span class="admin-nav-label">${group}</span>${ids.map(id=>{const [,title,glyph]=pages.find(page=>page[0]===id);return `<a href="#${id}" data-admin-nav="${id}" title="${title}">${icon(glyph,18)}<span>${title}</span></a>`;}).join('')}</div>`).join('');
const menuToggle=document.querySelector('#admin-menu-toggle');
function setMenuOpen(open){menuToggle.setAttribute('aria-expanded',String(open));menuToggle.textContent=open?'메뉴 닫기':'메뉴';document.querySelector('.admin-sidebar').classList.toggle('is-menu-open',open);}
menuToggle.onclick=()=>setMenuOpen(menuToggle.getAttribute('aria-expanded')!=='true');
document.querySelector('#admin-nav').addEventListener('click',event=>{if(event.target.closest('a')){setMenuOpen(false);main.focus({preventScroll:true});}});
function openAdminAccount(){
 if(!session.online)return;
 if(session.user){showAccount({onSignOut:signOutAdmin});return;}
 if(session.authProvider==='google'){signInAdminGoogle();return;}
 const d=dialog('관리자 로그인',`<form class="online-form"><label>이메일<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label><p class="online-help">서비스의 Google 계정과 별도로 발급된 운영 계정으로 로그인하세요.</p>${statusLine}<button type="submit" class="button primary">로그인</button></form>`);
 const form=d.querySelector('form');
 form.onsubmit=async event=>{
  event.preventDefault();busy(form,true);
  try{Object.assign(session,await requestApi('/auth/login',{method:'POST',body:Object.fromEntries(new FormData(form))}));await refreshSession();d.close();if(session.user?.forcePassword)showAccount();}
  catch(error){if(d.isConnected)form.querySelector('[role="status"]').textContent=error.message;}
  finally{busy(form,false);}
 };
}
document.querySelector('#admin-account').onclick=openAdminAccount;
function navigation(){const key=route(),title=pages.find(p=>p[0]===key)[1];document.title=`${title} · 60BASE 관리자`;document.querySelector('#admin-breadcrumb').textContent=title;document.querySelectorAll('[data-admin-nav]').forEach(a=>{if(a.dataset.adminNav===key)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
function gate(){navigation();document.querySelector('#admin-account').textContent=session.user?session.user.name:'관리자 로그인';document.querySelector('#admin-account').disabled=!session.online;document.querySelector('#admin-connection').textContent=session.online?'서버 연결됨':'서버 미연결';if(session.online&&session.user?.role==='admin'&&!session.user.forcePassword)return false;
 const title=!session.online?'관리자 서버 연결이 필요합니다.':!session.user?'60BASE 운영 관리':session.user.forcePassword?'비밀번호를 먼저 변경해주세요.':'관리자 계정으로 로그인해주세요.';
 const google=session.online&&!session.user&&session.authProvider==='google';
 const copy=!session.online?'운영 서버 연결을 준비하고 있습니다. 연결 후 관리자 계정으로 로그인할 수 있습니다.':!session.user?(google?'관리자 권한이 연결된 Google 계정으로 로그인하세요.':'운영 계정으로 로그인해주세요.'):session.user.forcePassword?'안전한 운영을 위해 임시 비밀번호를 본인만 아는 비밀번호로 바꿔주세요.':'현재 계정에는 운영 데이터를 볼 수 있는 권한이 없습니다. 계정 관리에서 로그아웃한 뒤 관리자 계정을 선택해주세요.';
 main.innerHTML=`<section class="online-panel admin-login"><h1>${title}</h1><p>${copy}</p>${google?'<button type="button" class="cloud-google-button" data-google-signin disabled><img src="../assets/brand/google-signin-g.png" alt="" width="20" height="20"><span>Google로 로그인</span></button><p class="online-status" data-admin-auth-status role="status" aria-live="polite"></p><button type="button" class="button" data-google-retry hidden>Google 다시 연결</button><a class="button" href="/studio/" data-admin-registration hidden>Studio에서 가입 확인</a>':session.online?`<button type="button" class="button primary" data-access>${session.user?'계정 관리':'관리자 로그인'}</button>`:'<button type="button" class="button" data-retry>연결 다시 확인</button>'}</section>`;
 main.querySelector('[data-google-signin]')?.addEventListener('click',signInAdminGoogle);
 main.querySelector('[data-google-retry]')?.addEventListener('click',()=>{googleMessage='';void initializeAdminGoogle();});
 main.querySelector('[data-access]')?.addEventListener('click',openAdminAccount);main.querySelector('[data-retry]')?.addEventListener('click',()=>location.reload());syncAdminGoogle();return true;
}
async function load(){
 const epoch=++state.epoch;if(gate())return;
 const focused=state.loadedRoute===route()?document.activeElement:null,focusId=focused?.id,refreshFocused=focused?.hasAttribute('data-refresh');
 if(state.loadedRoute!==route())main.innerHTML='<p role="status">운영 데이터를 불러오는 중입니다.</p>';
 main.setAttribute('aria-busy','true');
 try{
  const [data,overview]=await Promise.all([api('/admin/data'),api('/admin/overview?days='+state.days)]);
  if(epoch!==state.epoch||!canManage())return;
  Object.assign(state,{data,overview,loadedRoute:route()});render();
  if(focusId&&main.querySelector('#'+CSS.escape(focusId)))main.querySelector('#'+CSS.escape(focusId)).focus({preventScroll:true});
  else if(refreshFocused)main.querySelector('[data-refresh]')?.focus({preventScroll:true});
  document.querySelector('#admin-last-update').textContent='마지막 확인 '+date(new Date());
 }catch(error){if(epoch!==state.epoch||error.name==='AbortError')return;clearAdminData();showLoadError(error.message);}
 finally{if(epoch===state.epoch)main.removeAttribute('aria-busy');}
}
window.addEventListener('hashchange',()=>{state.filters={query:'',status:'all'};state.sort={scope:null,index:null,direction:'asc'};setMenuOpen(false);closeAdminDialogs();navigation();void load();main.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});});
window.addEventListener('service-session',()=>{state.filters={query:'',status:'all'};state.sort={scope:null,index:null,direction:'asc'};state.accessVersion++;clearAdminData();closeAdminDialogs();main.removeAttribute('aria-busy');if(sessionRecovery){gate();return;}void load();});
function heading(title,copy='',actions=''){return `<div class="online-toolbar"><div class="admin-page-title"><h1>${title}</h1>${copy?`<p>${copy}</p>`:''}</div><div class="online-toolbar-actions">${actions}<button type="button" class="button" data-refresh>새로고침</button></div></div>`;}
const kpi=(label,value,sub='')=>`<article class="online-kpi"><span>${label}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}</article>`;
const exportButton=type=>`<a class="button admin-export" href="/api/admin/export?type=${type}">CSV 내보내기</a>`;
const empty=message=>`<div class="online-empty"><h3>${message}</h3></div>`;
const button=(text,action,id)=>`<button type="button" class="button" data-admin-action="${action}" data-id="${esc(id)}">${text}</button>`;
function render(){navigation();const key=route();({overview:overviewPage,members:membersPage,videos:videosPage,tasks:tasksPage,data:dataPage,finance:financePage,payouts:payoutsPage,commerce:commercePage,tickets:ticketsPage,notices:noticesPage,audit:auditPage,settings:settingsPage}[key])();main.querySelector('[data-refresh]')?.addEventListener('click',load);main.querySelectorAll('[data-admin-action]').forEach(b=>b.onclick=()=>perform(b.dataset.adminAction,b.dataset.id));}
function trendChart(rows){
 if(!rows.length)return '<div class="admin-chart-empty">선택한 기간에 업로드된 영상이 없습니다.</div>';
 const visible=rows.slice(-14),max=Math.max(4,Math.ceil(Math.max(...visible.map(row=>row.count))/4)*4);
 return `<div class="admin-chart-frame"><div class="admin-chart-axis" aria-hidden="true">${[4,3,2,1,0].map(step=>`<span style="--tick:${(4-step)*25}">${(max*step/4).toLocaleString('ko-KR')}</span>`).join('')}</div><div class="admin-chart" role="list" aria-label="날짜별 영상 업로드 건수">${visible.map(row=>`<div class="admin-chart-col" style="--bar-height:${row.count/max*230}px" role="listitem" tabindex="0" title="${esc(row.day)} · ${row.count}건" aria-label="${esc(row.day)} 업로드 ${row.count}건"><strong>${row.count}</strong><i aria-hidden="true"></i><span>${esc(row.day.slice(5).replace('-','/'))}</span></div>`).join('')}</div></div>`;
}
function statusChart(rows){
 if(!rows.length)return '<div class="admin-chart-empty">아직 집계할 영상이 없습니다.</div>';
 const max=Math.max(1,...rows.map(row=>row.count));
 return `<div class="admin-status-chart" role="list" aria-label="누적 영상 상태별 건수">${rows.map(row=>`<div class="admin-status-column" role="listitem" aria-label="${esc(labels[row.status]||row.status)} ${row.count}건"><strong>${row.count}</strong><div class="admin-status-track"><i aria-hidden="true" style="--status-height:${row.count/max*100}%"></i></div><span>${esc(labels[row.status]||row.status)}</span></div>`).join('')}</div>`;
}
function breakdown(rows,total){return rows.length?`<div class="admin-breakdown">${rows.map(r=>`<div class="admin-breakdown-row"><div><span>${esc(r.label)}</span><strong>${r.count}건</strong></div><i><b style="--share:${Math.max(0,Math.min(100,r.count/Math.max(1,total)*100))}%"></b></i></div>`).join('')}</div>`:'<p class="admin-info-line">아직 집계할 데이터가 없습니다.</p>';}
const daysSelect=()=>`<label class="sr-only" for="admin-days">집계 기간</label><select id="admin-days" class="online-filter">${[7,30,90].map(d=>`<option value="${d}" ${d===state.days?'selected':''}>최근 ${d}일</option>`).join('')}</select>`;
function bindDays(){main.querySelector('#admin-days').onchange=e=>{state.days=Number(e.target.value);void load();};}
function overviewPage(){
 const o=state.overview,recent=[...state.data.videos].sort((a,b)=>new Date(b.submittedAt||b.createdAt)-new Date(a.submittedAt||a.createdAt)).slice(0,5);
 const recentHeaders=['영상','참여자','상태','접수일','검수'];
 const recentRow=v=>rowData([`<strong>${esc(v.title)}</strong><small>${esc(v.taskTitle)}</small>`,esc(v.memberName),badge(v.status),date(v.submittedAt||v.createdAt),['deleting','deleted'].includes(v.status)?esc(labels[v.status]||v.status):button('검수 열기','video',v.id)],[v.title,v.memberName,v.status,v.submittedAt||v.createdAt,'']);
 const recentTable=()=>{
  const query=state.filters.query.trim().toLocaleLowerCase('ko-KR');
  const selected=recent.filter(video=>[video.title,video.taskTitle,video.memberName,labels[video.status]||video.status].join(' ').toLocaleLowerCase('ko-KR').includes(query));
  return `${selected.length?tableMarkup('최근 영상',recentHeaders,selected.map(recentRow),{scope:'overview-recent',panel:false}):empty(query?'검색 조건에 맞는 영상이 없습니다.':'아직 접수된 영상이 없습니다.')}<span class="sr-only" role="status">최근 영상 ${recent.length}건 중 ${selected.length}건 표시</span>`;
 };
 const uploaded=o.trend.reduce((sum,row)=>sum+row.count,0);
 main.innerHTML=heading('운영 현황','',daysSelect()+exportButton('videos'))+`
  <div class="online-kpis admin-overview-kpis">${kpi('전체 회원',o.members+'명',`선택 기간 신규 ${o.newMembers}명`)}${kpi('누적 영상',o.videos+'건',(o.seconds/60).toFixed(1)+'분 · '+size(o.bytes))}${kpi('최종 승인',o.approved+'건','누적 승인 상태')}${kpi('심사 대기',o.pendingReviews+'건','다음 심사가 필요한 영상')}</div>
  <div class="admin-chart-grid admin-overview-charts"><section class="online-panel admin-trend-panel"><header class="admin-panel-heading"><h2>영상 업로드 추이</h2><span>최근 ${state.days}일</span></header><div class="admin-panel-body"><div class="admin-chart-summary"><span>선택 기간 업로드 <strong>${uploaded.toLocaleString('ko-KR')}<small>건</small></strong></span><span class="admin-chart-key">업로드 건수</span></div>${trendChart(o.trend)}<p class="admin-chart-footnote">업로드가 있는 최근 ${Math.min(14,o.trend.length)}개 날짜 · 업로드일 기준 · 단위: 건</p></div></section><section class="admin-priority online-panel" aria-labelledby="admin-status-title"><header class="admin-panel-heading"><h2 id="admin-status-title">영상 상태별 현황</h2><span>전체 기간</span></header><div class="admin-panel-body"><div class="admin-status-summary"><span>누적 영상</span><strong>${o.videos.toLocaleString('ko-KR')}<small>건</small></strong></div>${statusChart(o.statuses)}<div class="admin-priority-actions"><h3 id="admin-work-title">다음 검수를 이어가세요</h3><a class="button primary" href="#videos">영상·심사 열기 <span>${o.pendingReviews}건</span> ${icon('arrow',16)}</a><a class="admin-priority-inbox" href="#tickets">답변 대기 ${o.openTickets}건 ${icon('arrow',14)}</a></div></div></section></div>
  <section class="online-panel admin-recent"><header class="admin-panel-heading"><h2>최근 영상</h2><div class="admin-recent-tools"><label class="admin-recent-search">${icon('search',15)}<span class="sr-only">최근 영상 ${recent.length}건에서 검색</span><input id="admin-recent-search" type="search" placeholder="최근 ${recent.length}건에서 검색" value="${esc(state.filters.query)}" autocomplete="off"></label><a class="button" href="#videos">전체 영상 보기 ${icon('arrow',14)}</a></div></header><div class="admin-recent-results">${recentTable()}</div><p class="admin-data-legend">최근 업로드 최대 1,000건 중 접수일 기준 ${recent.length}건 · 미제출은 업로드일 기준</p></section>
  <div class="admin-chart-grid"><section class="online-panel"><h2>촬영 활동별 영상</h2><p class="admin-data-legend">누적 영상 ${o.videos}건 기준</p>${breakdown(o.categories.map(row=>({label:row.category,count:row.count})),o.videos)}</section><section class="online-panel"><h2>선택 기간의 매출·비용</h2><div class="admin-finance-values">${kpi('확인된 매출',money(o.income),'수기 매출 + 입금 확인 − 환불')}${kpi('확인된 비용',money(o.expenses),'수기 비용 + 지급 확인 출금')}${kpi('매출 − 비용',money(o.net),'기록된 현금 흐름 기준')}</div><a class="button" href="#finance">거래 기록 보기</a></section></div>`;
 main.querySelector('#admin-recent-search').addEventListener('input',event=>{
  state.filters.query=event.target.value;
  main.querySelector('.admin-recent-results').innerHTML=recentTable();
  bindTableSort();
  main.querySelectorAll('.admin-recent-results [data-admin-action]').forEach(button=>button.onclick=()=>perform(button.dataset.adminAction,button.dataset.id));
 });
 bindDays();bindTableSort();
}

const actionHeaders=new Set(['관리','처리','검수','답변','기존 처리 기록']);
const rowData=(cells,sort=cells)=>({cells,sort});
const cellsOf=row=>Array.isArray(row)?row:row.cells;
const sortOf=(row,index)=>Array.isArray(row)?row[index]:row.sort?.[index]??row.cells[index];
const stripHtml=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
function sortValue(value){
 if(value==null)return '';
 if(value instanceof Date)return value.getTime();
 if(typeof value==='number')return Number.isFinite(value)?value:0;
 if(typeof value==='boolean')return value?1:0;
 const text=stripHtml(value),numeric=Number(text.replace(/[^\d.-]/g,''));
 if(text&&Number.isFinite(numeric)&&/^[\s\d,.\-+원P초건]+$/.test(text))return numeric;
 const time=Date.parse(text);
 return Number.isFinite(time)?time:text;
}
function compareValues(left,right){
 const a=sortValue(left),b=sortValue(right);
 if(typeof a==='number'&&typeof b==='number')return a-b;
 return String(a).localeCompare(String(b),'ko-KR',{numeric:true,sensitivity:'base'});
}
function sortedRows(headers,rows,scope=route()){
 if(state.sort.scope!==scope||state.sort.index==null||actionHeaders.has(headers[state.sort.index]))return rows;
 const direction=state.sort.direction==='desc'?-1:1,index=state.sort.index;
 return rows.map((row,order)=>({row,order})).sort((a,b)=>{
  const result=compareValues(sortOf(a.row,index),sortOf(b.row,index));
  return result?result*direction:a.order-b.order;
 }).map(item=>item.row);
}
function tableCells(row,headers){return cellsOf(row).map((cell,index)=>`<td role="cell" headers="admin-col-${index}" ${String(cell).includes('data-admin-action')?'class="admin-action-col"':''}><span class="admin-cell-label" aria-hidden="true">${esc(headers[index])}</span><div class="admin-cell-value">${cell}</div></td>`).join('');}
function tableHead(headers,scope=route()){
 return headers.map((header,index)=>{
  const action=actionHeaders.has(header),active=state.sort.scope===scope&&state.sort.index===index,dir=active?state.sort.direction:'none';
  const content=action?esc(header):`<button type="button" class="admin-sort-button" data-admin-sort="${index}" data-admin-sort-scope="${esc(scope)}"><span data-admin-header-label>${esc(header)}</span><span class="admin-sort-indicator" aria-hidden="true">${active?(dir==='asc'?'▲':'▼'):'↕'}</span></button>`;
  return `<th role="columnheader" scope="col" id="admin-col-${index}" data-admin-header-label="${esc(header)}" aria-sort="${dir==='asc'?'ascending':dir==='desc'?'descending':'none'}" ${action?'class="admin-action-col"':''}>${content}</th>`;
 }).join('');
}
function bindTableSort(){
 main.querySelectorAll('[data-admin-sort]').forEach(button=>button.onclick=()=>{
  const index=Number(button.dataset.adminSort),scope=button.dataset.adminSortScope;
  const same=state.sort.scope===scope&&state.sort.index===index;
  state.sort={scope,index,direction:same&&state.sort.direction==='asc'?'desc':'asc'};
  render();
 });
}
function tableMarkup(title,headers,rows,{scope=route(),responsive=true,panel=true}={}){
 const visible=sortedRows(headers,rows,scope),tableClass=responsive?'online-table admin-responsive-table':'online-table';
 return `<div class="${panel?'online-panel ':''}online-table-wrap"><table class="${tableClass}" role="table"><caption class="sr-only">${title}</caption><thead role="rowgroup"><tr role="row">${tableHead(headers,scope)}</tr></thead><tbody role="rowgroup">${visible.map(row=>`<tr role="row">${tableCells(row,headers)}</tr>`).join('')}</tbody></table></div>`;
}
function tableView(title,copy,headers,rows,{actions='',filters='',limit=1000,scope=route()}={}){
 main.innerHTML=heading(title,copy,actions)+`${filters}<p class="admin-count" role="status" aria-live="polite">${rows.length}건${rows.length>=limit?` · 최근 ${limit.toLocaleString('ko-KR')}건까지 표시`:''}</p>${rows.length?tableMarkup(title,headers,rows,{scope}):empty('표시할 내역이 없습니다.')}`;
 bindTableSort();
}
function searchable(rows,renderRows,{placeholder='검색',statuses=[]}={}){
 const current=state.filters;
 const filters=`<div class="online-filter-row"><label class="sr-only" for="admin-search">${placeholder}</label><input id="admin-search" class="online-filter admin-table-search" type="search" placeholder="${placeholder}" value="${esc(current.query)}">${statuses.length?`<label class="sr-only" for="admin-filter">상태</label><select id="admin-filter" class="online-filter"><option value="all">모든 상태</option>${statuses.map(status=>`<option value="${status}" ${current.status===status?'selected':''}>${labels[status]||status}</option>`).join('')}</select>`:''}<button type="button" class="button" id="admin-search-reset">검색 초기화</button></div>`;
 return {filters,bind:()=>{
  const search=main.querySelector('#admin-search'),filter=main.querySelector('#admin-filter'),body=main.querySelector('tbody'),count=main.querySelector('.admin-count'),reset=main.querySelector('#admin-search-reset');
  const headers=[...main.querySelectorAll('thead th')].map(cell=>cell.dataset.adminHeaderLabel||cell.textContent);
  const apply=()=>{
   state.filters={query:search.value,status:filter?.value||'all'};
   const query=search.value.trim().toLowerCase(),selected=rows.filter(row=>(!filter||filter.value==='all'||row.status===filter.value)&&JSON.stringify(row).toLowerCase().includes(query));
   if(body){const rendered=sortedRows(headers,renderRows(selected));body.innerHTML=selected.length?rendered.map(row=>`<tr role="row">${tableCells(row,headers)}</tr>`).join(''):`<tr class="admin-empty-row" role="row"><td role="cell" colspan="${headers.length}"><h3>검색 결과가 없습니다.</h3><p>검색어나 상태를 바꾸거나 검색을 초기화하세요.</p></td></tr>`;}
   count.textContent=`${selected.length}건 / ${rows.length}건${rows.length>=1000?' · 최근 1,000건':''}`;
   reset.disabled=!search.value&&(!filter||filter.value==='all');
   main.querySelectorAll('[data-admin-action]').forEach(button=>button.onclick=()=>perform(button.dataset.adminAction,button.dataset.id));
  };
  search.oninput=apply;if(filter)filter.onchange=apply;
  reset.onclick=()=>{search.value='';if(filter)filter.value='all';apply();search.focus();};
  apply();
 }};
}
function walletPoints(user,field='available'){return user.wallet&&Number.isFinite(Number(user.wallet[field]))?points(user.wallet[field]):'<span class="admin-muted-text">확인 필요</span>';}
function reviewStageLabel(stage,status){
 if(status==='approved'||stage==='complete')return '완료';
 if(stage==='manual')return '2단계 · 수작업 심사';
 if(stage==='client')return '3단계 · 클라이언트 확인';
 return '1단계 · AI 심사';
}
function membersPage(){const items=state.data.members,rows=items=>items.map(u=>rowData([`<strong>${esc(u.name)}</strong><small>${esc(u.email)}</small>`,u.role==='admin'?'관리자':'참여자',badge(u.status),u.videoCount+'건',walletPoints(u),date(u.createdAt),button('상세·관리','member',u.id)],[u.name,u.role,u.status,u.videoCount,u.wallet?.available,u.createdAt,''])),search=searchable(items,rows,{placeholder:'이름 또는 이메일 검색',statuses:['active','suspended']});tableView('회원 관리','회원의 활동과 보유 포인트를 확인합니다.',['회원','권한','상태','영상','보유 포인트','가입일','관리'],rows(items),{actions:exportButton('members'),filters:search.filters});search.bind();}
function videosPage(){const items=state.data.videos,rows=items=>items.map(v=>rowData([`<strong>${esc(v.title)}</strong><small>${esc(v.taskTitle)}</small>`,`<strong>${esc(v.memberName)}</strong><small>${esc(v.memberEmail)}</small>`,badge(v.status),`<span>${esc(reviewStageLabel(v.reviewStage,v.status))}</span>`,Math.round(v.duration)+'초 / '+size(v.size),date(v.submittedAt||v.createdAt),['deleting','deleted'].includes(v.status)?'<span>'+labels[v.status]+'</span>':button('검수 열기','video',v.id)],[v.title,v.memberName,v.status,reviewStageLabel(v.reviewStage,v.status),v.duration,v.submittedAt||v.createdAt,''])),search=searchable(items,rows,{placeholder:'영상, 회원, 촬영 활동 검색',statuses:['submitted','reviewing','approved','rejected','uploaded','deleting','deleted']});tableView('영상·심사','3단계 승인 절차로 원본과 촬영 기준을 확인합니다.',['영상','제출자','상태','심사 단계','길이·용량','접수일','검수'],rows(items),{actions:exportButton('videos'),filters:search.filters});search.bind();}
function tasksPage(){tableView('촬영 활동','촬영 조건과 승인 포인트, 모집 공개 여부를 관리합니다.',['활동','분류','승인 포인트','공개 상태','관리'],state.data.tasks.map(t=>rowData([`<strong>${esc(t.title)}</strong><small>${esc(t.instructions.slice(0,85))}</small>`,esc(t.category),points(t.reward),t.published?'공개':'비공개',button('수정','task',t.id)],[t.title,t.category,t.reward,t.published,''])),{actions:button('활동 추가','task','')});}
function dataPage(){const o=state.overview;main.innerHTML=heading('데이터 현황','누적 수집량과 촬영 분포, 심사 결과를 확인합니다.',exportButton('videos'))+`<div class="online-kpis">${kpi('누적 영상',o.videos+'건')}${kpi('촬영 시간',(o.seconds/3600).toFixed(2)+'시간')}${kpi('영상 저장량',size(o.bytes),`한도 ${size(o.settings.totalStorageBytes)}`)}${kpi('승인율',(o.approved+o.rejected?Math.round(o.approved/(o.approved+o.rejected)*100):0)+'%','승인 ÷ 결과가 확정된 영상')}</div><div class="admin-chart-grid"><section class="online-panel"><h3>촬영 활동 분포</h3>${breakdown(o.categories.map(r=>({label:r.category,count:r.count})),o.videos)}</section><section class="online-panel"><h3>심사 상태별 구성</h3>${breakdown(o.statuses.map(r=>({label:labels[r.status]||r.status,count:r.count})),o.videos)}</section></div><section class="online-panel"><h3>데이터 확인 기준</h3><div class="admin-columns-three"><div><strong>원본 파일</strong><p class="admin-info-line">서버에서 영상 길이와 해상도를 읽고, 파일 중복 여부를 확인합니다.</p></div><div><strong>검수 기록</strong><p class="admin-info-line">구도·손·개인정보·완료 여부를 확인한 결과와 심사 차수를 남깁니다.</p></div><div><strong>동의와 구간 라벨</strong><p class="admin-info-line">제출 시 확인한 이용 동의와 시간별 작업 라벨을 영상에 연결합니다.</p></div></div></section>`;}
function financePage(){const o=state.overview,headers=['거래일','구분·항목','거래처','금액','증빙 번호'],rows=state.data.entries.map(e=>rowData([esc(e.date),`${e.kind==='income'?'매출':'비용'} · ${esc(e.category)}`,esc(e.party),money(e.amount),esc(e.reference)],[e.date,e.kind+' '+e.category,e.party,e.amount,e.reference]));main.innerHTML=heading('매출·비용','실제 확인된 거래를 증빙과 함께 기록합니다.',daysSelect()+button('거래 기록','entry','')+exportButton('entries'))+`<div class="online-kpis">${kpi('매출 기록',money(o.finance.recordedIncome),'데이터 판매 등 수기 거래')}${kpi('주문 매출',money(o.finance.orderSales),'입금 확인 − 환불 (거래일 기준)')}${kpi('비용 기록',money(o.finance.recordedExpenses),'수기 비용')}${kpi('참여자 지급',money(o.finance.payouts),'이체 확인 완료 건')}</div><section class="online-panel"><h3>거래 기록</h3>${rows.length?tableMarkup('거래 기록',headers,rows,{scope:'finance-entries',responsive:false,panel:false}):empty('등록된 거래가 없습니다.')}</section><p class="admin-data-legend">기존 적립금으로 결제한 순매출 ${money(o.finance.rewardSales)}은 별도 집계되며 현금 매출에 합산하지 않습니다.</p><p class="admin-data-legend">이 화면에 기록해도 결제·은행 이체는 실행되지 않습니다. 실제 확인한 거래만 입력해주세요. 주문 매출과 출금 지급은 자동 집계되므로 수기 거래에 중복 입력하지 않습니다.</p>`;bindDays();bindTableSort();}
function payoutsPage(){
 tableView('출금 관리','현재 포인트로만 운영합니다. 기존 출금 기록은 조회만 할 수 있습니다.',['참여자','기존 금액','계좌 끝자리','상태','신청일','기존 처리 기록'],state.data.payouts.map(p=>rowData([esc(p.memberName),money(p.amount),esc(p.bank?.bank||'—')+' · '+esc(p.bank?.last4||'—'),badge(p.status),date(p.createdAt),'<span>조회 전용</span><small>'+esc(p.reference||'확인번호 없음')+'</small><small>'+esc(p.note||'')+'</small>'],[p.memberName,p.amount,p.bank?.last4||'',p.status,p.createdAt,''])),{actions:exportButton('payouts'),filters:'<section class="online-panel admin-planned"><h2>국내 은행 연동 예정</h2><p>은행 연결과 출금 신청·지급 처리는 아직 제공하지 않습니다. 포인트의 현금 전환 기준과 이용 일정은 정해지지 않았습니다.</p><button type="button" class="button" disabled>국내 은행 연동 예정</button></section>'});
}
function commercePage(){
 const tabs='<div class="admin-tabs"><button type="button" class="button" data-commerce="orders" aria-pressed="'+(state.commerce==='orders')+'">기존 주문 내역</button><button type="button" class="button" data-commerce="products" aria-pressed="'+(state.commerce==='products')+'">기존 상품 내역</button></div>',copy='현재 포인트 적립만 운영합니다. 상품 주문과 포인트 사용은 준비 중이며, 기존 내역은 조회만 할 수 있습니다.';
 if(state.commerce==='orders')tableView('상품·주문',copy,['주문','참여자','기존 금액·방식','상태','주문일','기존 처리 기록'],state.data.orders.map(o=>rowData([o.items.map(i=>esc(i.title)+' × '+i.quantity).join(', ')+'<small>'+esc(o.id.slice(-8))+'</small>',esc(o.memberName),money(o.total)+'<small>'+(o.method==='reward'?'기존 적립금':'입금 확인')+'</small>',badge(o.status),date(o.createdAt),'<span>조회 전용</span><small>'+esc(o.reference||'확인번호 없음')+'</small><small>'+esc(o.note||'')+'</small>'],[o.items.map(i=>i.title).join(' '),o.memberName,o.total,o.status,o.createdAt,''])),{actions:exportButton('orders'),filters:tabs,scope:'commerce-orders'});
 else tableView('상품·주문',copy,['상품','기존 가격','남은 재고','기존 공개 상태','관리'],state.data.products.map(p=>rowData(['<strong>'+esc(p.title)+'</strong><small>'+esc(p.description)+'</small>',money(p.price),p.stock,p.published?'공개':'비공개','<span>조회 전용</span>'],[p.title,p.price,p.stock,p.published,''])),{filters:tabs,scope:'commerce-products'});
 main.querySelectorAll('[data-commerce]').forEach(b=>b.onclick=()=>{state.commerce=b.dataset.commerce;state.sort={scope:null,index:null,direction:'asc'};render();});
}
function ticketsPage(){
 const items=state.data.tickets,rows=items=>items.map(t=>rowData([`<strong>${esc(t.subject)}</strong><small>${esc(t.message.slice(0,100))}</small>`,esc(t.memberName),badge(t.status),date(t.createdAt),button('답변','ticket',t.id)],[t.subject,t.memberName,t.status,t.createdAt,'']));
 const search=searchable(items,rows,{placeholder:'제목, 내용 또는 참여자 검색',statuses:['open','replied','closed']});
 tableView('문의함','참여자의 문의를 검색하고 답변과 처리 상태를 함께 관리하세요.',['문의','참여자','상태','접수일','답변'],rows(items),{filters:search.filters});search.bind();
}
function noticesPage(){tableView('공지 관리','촬영·심사·정산 관련 안내를 작성하고 공개합니다.',['공지','공개 상태','수정일','관리'],state.data.announcements.map(n=>rowData([`<strong>${esc(n.title)}</strong><small>${esc(n.body.slice(0,100))}</small>`,n.published?'공개':'비공개',date(n.updatedAt),button('수정','notice',n.id)],[n.title,n.published,n.updatedAt,''])),{actions:button('공지 작성','notice','')});}
function auditPage(){tableView('변경 기록','운영 데이터 조회·변경과 내보내기 이력을 확인합니다.',['시각','작업자','작업','대상'],state.data.audit.map(a=>rowData([date(a.createdAt),esc(a.actorName||'시스템'),esc(a.action),`<span class="online-monospace">${esc(a.target)}</span>`],[a.createdAt,a.actorName||'시스템',a.action,a.target])),{actions:exportButton('audit'),limit:200});}
function settingsPage(){
 const s=state.data.settings;
 main.innerHTML=heading('운영 설정')+`<div class="admin-settings-grid"><section class="online-panel"><form class="online-form" id="admin-settings">
  <fieldset><legend>접수 상태</legend><label class="online-check"><input type="checkbox" name="intakeOpen" ${s.intakeOpen?'checked':''}>영상 접수 받기</label><label class="online-check"><input type="checkbox" name="shopOpen" disabled>상품 주문 · 포인트 사용 준비 중</label><p class="admin-settings-change" id="admin-settings-change" role="status" hidden></p></fieldset>
  <fieldset><legend>문의와 안내</legend><label>운영 주체<input name="operatorName" required maxlength="120" value="${esc(s.operatorName)}"></label><label>문의 이메일<input name="contactEmail" type="email" required maxlength="254" value="${esc(s.contactEmail)}"></label><label>서비스 안내<textarea name="notice" maxlength="1000">${esc(s.notice)}</textarea></label></fieldset>
  ${statusLine}<button type="submit" class="button primary">설정 저장</button>
 </form></section><section class="admin-settings-health"><h2>연결 상태</h2><ul class="admin-health-list">
  <li><div>회원·운영 데이터<small>운영 서버에 저장</small></div><span class="admin-pill">연결됨</span></li><li><div>영상 보관<small>비공개 원본 저장소</small></div><span class="admin-pill">연결됨</span></li><li><div>포인트·출금<small>포인트 적립만 운영 · 국내 은행 연동 예정</small></div><span class="admin-pill">출금 비활성</span></li><li><div>계정 복구 메일<small>메일 서비스 연결 필요</small></div><span class="admin-pill">미연결</span></li><li><div>원본 백업<small>운영 서버에서 별도 보관</small></div><span class="admin-pill">운영자 관리</span></li>
 </ul><p class="admin-info-line">보관 한도: 영상당 ${size(s.maxVideoBytes)} · 회원당 ${size(s.memberStorageBytes)} · 전체 ${size(s.totalStorageBytes)}</p></section></div>`;
 const form=main.querySelector('form'),notice=main.querySelector('#admin-settings-change');
 const popupPanel=document.createElement('section');popupPanel.className='online-panel';main.append(popupPanel);
 void import('./welcome-popup.js').then(module=>{if(popupPanel.isConnected&&canManage())return module.mountWelcomePopupSettings(popupPanel,{api});}).catch(error=>{if(popupPanel.isConnected)popupPanel.textContent='팝업 설정을 불러오지 못했습니다: '+error.message;});
 const deletionPanel=document.createElement('section');deletionPanel.className='online-panel';
 const deletionButton=document.createElement('button');deletionButton.type='button';deletionButton.className='button';deletionButton.textContent='계정 삭제 요청 관리';deletionPanel.append(deletionButton);main.append(deletionPanel);
 deletionButton.onclick=async()=>{deletionButton.disabled=true;try{const module=await import('./account-deletions.js');if(deletionPanel.isConnected&&canManage())await module.mountAccountDeletions(deletionPanel,{api});}catch(error){if(deletionPanel.isConnected){deletionButton.disabled=false;deletionButton.textContent='다시 불러오기: '+error.message;}}};
 form.onchange=()=>{
  const changes=[['intakeOpen','영상 접수']].filter(([key])=>form.elements[key].checked!==Boolean(s[key])).map(([key,label])=>`${label}를 ${form.elements[key].checked?'시작':'중단'}합니다.`);
  notice.hidden=!changes.length;notice.textContent=changes.length?'저장하면 '+changes.join(' '):'';
 };
 form.onsubmit=async event=>{
  event.preventDefault();busy(form,true);
  try{const body=Object.fromEntries(new FormData(form));body.intakeOpen=form.elements.intakeOpen.checked;body.shopOpen=false;await api('/admin/settings',{method:'PATCH',body});await load();const message=main.querySelector('#admin-settings [role="status"].online-status');if(message)message.textContent='설정을 저장했습니다.';}
  catch(error){if(form.isConnected)form.querySelector('.online-status').textContent=error.message;}
  finally{busy(form,false);}
 };
}
function field(label,name,value='',type='text',extra=''){if(type==='textarea')return `<label>${label}<textarea name="${name}" ${extra}>${esc(value)}</textarea></label>`;if(type==='checkbox')return `<label class="online-check"><input type="checkbox" name="${name}" ${value?'checked':''} ${extra}>${label}</label>`;return `<label>${label}<input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;}
function formDialog(title,fields,onSubmit,{wide=false,submit='저장'}={}){const d=dialog(title,`<form class="online-form">${fields}${statusLine}<button type="submit" class="button primary">${submit}</button></form>`,{wide});const form=d.querySelector('form'),requestKey=crypto.randomUUID();form.onsubmit=async e=>{e.preventDefault();busy(form,true);try{await onSubmit({...Object.fromEntries(new FormData(form)),requestKey},form,d);d.close();await load();}catch(error){form.querySelector('[role="status"]').textContent=error.message;}finally{busy(form,false);}};return d;}
async function perform(action,id){if(['product','payout','order'].includes(action))return;const version=state.accessVersion;try{
 if(action==='member'){const u=state.data.members.find(u=>u.id===id),w=u.wallet;formDialog('회원 관리',`<dl class="admin-detail-grid"><div><dt>이름</dt><dd>${esc(u.name)}</dd></div><div><dt>이메일</dt><dd>${esc(u.email)}</dd></div><div><dt>가입일</dt><dd>${date(u.createdAt)}</dd></div><div><dt>등록 영상</dt><dd>${u.videoCount}건</dd></div><div><dt>현재 보유 포인트</dt><dd>${w?points(w.available):'불러오기 필요'}</dd></div><div><dt>누적 적립 포인트</dt><dd>${w?points(w.earned):'불러오기 필요'}</dd></div></dl><label>계정 상태<select name="status"><option value="active" ${u.status==='active'?'selected':''}>이용 중</option><option value="suspended" ${u.status==='suspended'?'selected':''} ${u.role==='admin'?'disabled':''}>이용 정지</option></select></label>${field('운영 메모','notes',u.notes,'textarea','maxlength="2000"')}`,b=>api('/admin/members/'+id,{method:'PATCH',body:b}));}
 if(action==='video')await reviewDialog(id);
 if(action==='task'){const t=state.data.tasks.find(t=>t.id===id)||{};formDialog(id?'촬영 활동 수정':'촬영 활동 추가',field('활동명','title',t.title,'text','required maxlength="150"')+field('분류','category',t.category||'주방','text','required maxlength="60"')+field('촬영 안내','instructions',t.instructions,'textarea','required maxlength="6000"')+field('승인 포인트 (P)','reward',t.reward??3000,'number','required min="0" max="1000000"')+field('참여자에게 공개','published',t.published,'checkbox'),(b,form)=>api('/admin/tasks',{method:'POST',body:{...b,id:id||undefined,reward:Number(b.reward),published:form.elements.published.checked}}));}
 if(action==='notice'){const n=state.data.announcements.find(n=>n.id===id)||{};formDialog(id?'공지 수정':'공지 작성',field('제목','title',n.title,'text','required maxlength="150"')+field('공지 내용','body',n.body,'textarea','required maxlength="6000" rows="7"')+field('공지 공개','published',n.published,'checkbox'),(b,form)=>api('/admin/announcements',{method:'POST',body:{...b,id:id||undefined,published:form.elements.published.checked}}));}
 if(action==='ticket'){const t=state.data.tickets.find(t=>t.id===id);formDialog('문의 답변',`<div class="admin-ticket-layout"><section class="admin-ticket-context"><span class="admin-eyebrow">참여자 문의</span><h3>${esc(t.subject)}</h3><p class="admin-info-line">${esc(t.memberName)} · ${date(t.createdAt)}</p>${badge(t.status)}<div class="admin-ticket-message">${esc(t.message)}</div>${t.response?`<h3>기존 답변</h3><div class="admin-ticket-message is-response">${esc(t.response)}</div>`:'<p class="admin-info-line">아직 등록된 답변이 없습니다.</p>'}</section><section class="admin-ticket-compose"><h3>답변 작성</h3><p class="admin-info-line">저장한 답변은 참여자의 문의 내역에 표시됩니다.</p>${field('답변','response',t.response,'textarea','required maxlength="6000" rows="9"')}<label>처리 상태<select name="status"><option value="replied" ${t.status==='closed'?'':'selected'}>답변 완료</option><option value="closed" ${t.status==='closed'?'selected':''}>처리 완료</option></select></label></section></div>`,b=>api('/admin/tickets/'+id,{method:'PATCH',body:b}),{wide:true,submit:'답변 저장'});} 
 if(action==='entry')formDialog('확인된 거래 기록',`<p class="online-help">주문 결제와 출금 지급은 자동 집계됩니다. 그 외 실제 거래만 기록해주세요.</p><label>구분<select name="kind"><option value="income">매출</option><option value="expense">비용</option></select></label>${field('항목','category','데이터 판매','text','required maxlength="60"')}${field('금액 (원)','amount','','number','required min="1" max="1000000000"')}${field('거래일','date',new Date(Date.now()+9*3600000).toISOString().slice(0,10),'date','required')}${field('거래처','party','','text','maxlength="120"')}${field('증빙 번호','reference','','text','required minlength="3" maxlength="120"')}${field('메모','note','','textarea','maxlength="2000"')}`,b=>api('/admin/entries',{method:'POST',body:{...b,amount:Number(b.amount)}}));
 }catch(e){if(version!==state.accessVersion||e.name==='AbortError'||!canManage())return;dialog('확인하지 못했습니다.',`<p>${esc(e.message)}</p>`);}}
const reviewStageCopy={
 ai:{title:'1단계 · AI 심사',note:'자동 심사 개발 예정 · 현재 관리자 확인',approve:'1단계 승인 · 수작업 심사로'},
 manual:{title:'2단계 · 수작업 심사',note:'우리 인력이 원본과 기준을 직접 확인합니다.',approve:'2단계 승인 · 클라이언트 확인으로'},
 client:{title:'3단계 · 클라이언트 확인',note:'현재 관리자 승인으로 기록',approve:'최종 승인·포인트 적립'}
};
function reviewDisplayState(video){
 if(video.status==='approved'||video.reviewStage==='complete')return {key:'complete',title:'심사 완료',note:'최종 승인과 포인트 적립까지 완료된 영상입니다.',help:'완료된 영상은 더 이상 단계 승인을 진행하지 않습니다.',notice:'최종 승인된 영상은 더 이상 심사할 수 없습니다.'};
 if(video.status==='rejected')return {key:'rejected',title:'반려됨',note:'보완 사유가 기록되었습니다. 참여자가 다시 제출하면 1단계부터 심사합니다.',help:'아래 심사 이력에서 반려 단계와 사유를 확인할 수 있습니다.',notice:'반려된 영상은 재제출 전까지 심사할 수 없습니다.'};
 if(video.status==='uploaded')return {key:'uploaded',title:'제출 전',note:'참여자가 동의와 제출을 완료하면 1단계 심사를 시작합니다.',help:'아직 심사 대상이 아니므로 승인이나 반려를 기록하지 않습니다.',notice:'제출 전 영상은 심사할 수 없습니다.'};
 const stage=video.reviewStage||'ai';
 const current=reviewStageCopy[stage]||reviewStageCopy.ai;
 return {key:stage,title:current.title,note:current.note,help:stage==='client'?'최종 승인하면 안내된 포인트가 한 번 적립됩니다. 반려 시 참여자가 고칠 내용을 구체적으로 남겨주세요.':'승인하면 다음 심사 단계로 넘어가며 포인트는 아직 적립되지 않습니다. 반려 시 참여자가 고칠 내용을 구체적으로 남겨주세요.',notice:'접수되었거나 검토 중인 영상만 심사할 수 있습니다.'};
}
function hasRecordedStageApprovals(reviews,revision){
 return ['ai','manual','client'].every(stage=>reviews.some(r=>r.stage===stage&&r.decision==='approved'&&r.revision===revision));
}
function reviewProgress(stage,status,reviews=[],revision=0){
 if((status==='approved'||stage==='complete')&&!hasRecordedStageApprovals(reviews,revision)){
  return '<div class="admin-review-summary"><strong>기존 승인 기록</strong><p>기존에 승인된 영상입니다. 새 3단계 심사 이력은 없습니다.</p></div>';
 }
 const current=status==='approved'||stage==='complete'?'complete':status==='uploaded'?'uploaded':stage||'ai';
 const stages=['ai','manual','client'];
 return `<ol class="admin-review-steps">${stages.map((key,index)=>{
  const done=current==='complete'||stages.indexOf(current)>index,active=current===key&&status!=='rejected';
  const label=status==='rejected'&&current===key?'반려':done?'완료':active?reviewStageCopy[key].note:'대기';
  return `<li class="${done?'is-done ':''}${active?'is-active':''}" ${active?'aria-current="step"':''}><span>${index+1}</span><strong>${reviewStageCopy[key].title}</strong><small>${label}</small></li>`;
 }).join('')}</ol>`;
}
function reviewHistory(reviews){
 return reviews.map(r=>{
  const stage=reviewStageCopy[r.stage]?.title||'기존 심사',actor=r.actorName?` · ${esc(r.actorName)}`:'';
  return `<li>${badge(r.decision)}<p>${stage} · ${date(r.createdAt)} · ${r.revision}차${actor}</p>${r.reason?`<p>${esc(r.reason)}</p>`:''}</li>`;
 }).join('')||'<li>아직 기록이 없습니다.</li>';
}
async function reviewDialog(id){
 const d=dialog('영상 검수','<p role="status">영상을 불러오는 중입니다.</p>',{wide:true});
 try{const item=await api('/videos/'+id);if(!d.isConnected)return;const v=item.video,stage=v.reviewStage||'ai',stageInfo=reviewStageCopy[stage]||reviewStageCopy.ai,display=reviewDisplayState(v),canReview=['submitted','reviewing'].includes(v.status)&&stage!=='complete',checks=v.checks||{},manualStage=stage==='manual';
  d.querySelector('.online-dialog-body').innerHTML=`<div class="admin-review-layout">
    <section class="admin-review-video"><video src="/api/videos/${esc(id)}/file" controls playsinline preload="metadata"></video><h3>${esc(v.title)}</h3><div class="admin-review-facts"><div>영상 길이<strong>${v.duration.toFixed(1)}초</strong></div><div>해상도<strong>${v.width} × ${v.height}</strong></div><div>승인 포인트<strong>${points(v.reward)}</strong></div></div><p class="admin-info-line">${esc(item.task.instructions)}</p></section>
    <section class="admin-review-decision">${badge(v.status)}${reviewProgress(stage,v.status,item.reviews,v.revision)}<h3>${display.title}</h3><p class="admin-info-line">${display.note}</p><form class="online-form" data-review><fieldset ${canReview?'':'disabled'}>${[['framing','촬영 구도와 작업 대상이 충분히 보입니다.'],['hands','손과 동작의 가시성을 확인했습니다.'],['privacy','개인정보와 타인의 권리를 확인했습니다.'],['completion','지정한 작업 범위와 완료 조건에 맞습니다.']].map(([key,label])=>field(label,key,checks[key],'checkbox',manualStage?'':'disabled')).join('')}${field('보완 사유·검수 메모','reason',v.reason,'textarea','maxlength="2000" rows="4"')}</fieldset><p class="online-help">${display.help}</p>${statusLine}${canReview?`<div class="admin-review-actions"><button type="submit" name="decision" value="reviewing" class="button">검토 중으로</button><button type="submit" name="decision" value="rejected" class="button danger">반려</button><button type="submit" name="decision" value="approved" class="button primary">${stageInfo.approve}</button></div>`:`<p class="online-notice">${display.notice}</p>`}</form></section>
    <section class="admin-review-annotations"><h3>작업 구간 라벨</h3><div data-annotations>${item.annotations.length?item.annotations.map(a=>`<p class="admin-info-line">${a.start.toFixed(1)}–${a.end.toFixed(1)}초 · ${esc(a.label)}</p>`).join(''):'<p class="admin-info-line">등록된 구간이 없습니다.</p>'}</div><form class="online-form" data-annotation><div class="online-form-cols">${field('시작 (초)','start',0,'number',`required min="0" max="${v.duration}" step="0.1"`)}${field('종료 (초)','end',Math.min(3,v.duration),'number',`required min="0" max="${v.duration}" step="0.1"`)}</div>${field('동작 라벨','label','','text','required maxlength="120"')}<button type="button" class="button" data-use-time>현재 재생 위치를 시작 시간으로</button>${statusLine}<button type="submit" class="button">구간 라벨 추가</button></form><a class="button" href="/api/videos/${esc(id)}/export" target="_blank" rel="noopener">메타데이터·동의·라벨 JSON</a></section>
    <section class="admin-review-history"><h3>제출 동의</h3><p class="admin-info-line">동의 버전 ${esc(v.consent.version||'미제출')}<br>${v.consent.at?date(v.consent.at):'제출 전입니다.'}<br>국내 촬영 확인: ${v.consent.recordedInKorea===true?'참여자 직접 확인 (위치 검증 아님)':'기존 제출 · 확인 기록 없음'}</p><button type="button" class="button danger" data-remove-video>원본 삭제 처리</button><h3>심사 이력</h3><ol class="online-history">${reviewHistory(item.reviews)}</ol></section>
  </div>`;
  d.querySelector('[data-remove-video]').onclick=()=>{formDialog('영상 원본 삭제',`<p>개인정보·동의 철회 요청을 확인한 뒤 처리해주세요. 원본 파일과 구간 라벨이 삭제되며, 승인 포인트와 기존 정산 기록은 유지됩니다.</p>${field('삭제 사유·문의 번호','reason','','textarea','required minlength="3" maxlength="1000"')}<label class="online-check"><input name="confirmed" type="checkbox" required>삭제할 영상: ${esc(v.title)}</label>`,async b=>{await api('/admin/videos/'+id+'/remove',{method:'POST',body:{reason:b.reason,confirm:id}});d.close();},{submit:'확인한 원본 삭제'});};
  const review=d.querySelector('[data-review]');review.onsubmit=async e=>{e.preventDefault();busy(review,true);try{const nextChecks=Object.fromEntries(['framing','hands','privacy','completion'].map(k=>[k,review.elements[k]?.checked??checks[k]===true]));await api('/admin/videos/'+id+'/review',{method:'POST',body:{decision:e.submitter.value,stage,revision:v.revision,reason:review.elements.reason.value,checks:nextChecks}});d.close();await load();}catch(e){review.querySelector('[role="status"]').textContent=e.status===409?e.message+' 목록을 새로고침한 뒤 다시 열어주세요.':e.message;}finally{busy(review,false);}};
  const annotation=d.querySelector('[data-annotation]');d.querySelector('[data-use-time]').onclick=()=>{annotation.elements.start.value=d.querySelector('video').currentTime.toFixed(1);};annotation.onsubmit=async e=>{e.preventDefault();busy(annotation,true);try{await api('/admin/videos/'+id+'/annotation',{method:'POST',body:{start:Number(annotation.elements.start.value),end:Number(annotation.elements.end.value),label:annotation.elements.label.value,note:''}});const data=await api('/videos/'+id);d.querySelector('[data-annotations]').innerHTML=data.annotations.map(a=>`<p class="admin-info-line">${a.start.toFixed(1)}–${a.end.toFixed(1)}초 · ${esc(a.label)}</p>`).join('');annotation.querySelector('[role="status"]').textContent='구간 라벨을 저장했습니다.';}catch(e){annotation.querySelector('[role="status"]').textContent=e.message;}finally{busy(annotation,false);}};
 }catch(e){d.querySelector('.online-dialog-body').textContent=e.message;}
}
await sessionReady;if(session.authProvider==='google')void initializeAdminGoogle();await load();
