import { isNativeApp, nativeApiRequest } from '../app/native.js';
export const session={online:false,user:null,csrf:null,settings:{},authProvider:'password',authMethod:null};
export let sessionEpoch=0;
let publishedUserId;
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=value=>new Intl.NumberFormat('ko-KR').format(Number(value)||0)+'원';
export const points=value=>new Intl.NumberFormat('ko-KR').format(Number(value)||0)+'P';
export const date=value=>value?new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
export const size=value=>Number(value)>1048576?(value/1048576).toFixed(1)+' MB':Math.ceil((Number(value)||0)/1024)+' KB';
export const labels={deleting:'삭제 처리 중',deleted:'삭제됨',uploaded:'제출 전',submitted:'접수 완료',reviewing:'검토 중',approved:'승인',rejected:'반려',pending:'처리 대기',paid:'지급·결제 확인',requested:'입금 확인 전',shipped:'발송 완료',cancelled:'취소',refunded:'환불 완료',active:'이용 중',suspended:'이용 정지',open:'답변 대기',replied:'답변 완료',closed:'처리 완료'};
export const badge=status=>`<span class="online-badge status-${esc(status)}">${esc(labels[status]||status)}</span>`;
export async function api(path,{method='GET',body,raw,signal}={}){
 const requestUserId=session.user?.id,requestEpoch=sessionEpoch;
 const response=isNativeApp()?await nativeApiRequest('/api'+path,{method,body,raw,csrf:session.csrf||'',signal}):await fetch('/api'+path,{method,credentials:'same-origin',signal,headers:{...(raw?{'Content-Type':'application/octet-stream'}:body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':session.csrf||''}:{})},body:raw|| (body?JSON.stringify(body):undefined)});
 let result;try{result=await response.json();}catch{throw Error('온라인 서비스 연결을 준비하고 있습니다. 잠시 후 다시 확인해주세요.');}
 if(response.status===401&&requestUserId&&session.user?.id===requestUserId&&sessionEpoch===requestEpoch&&path!=='/session')await refreshSession({expectedUserId:requestUserId,expectedEpoch:requestEpoch});
 if(!response.ok){const error=Error(result.error||'요청을 처리하지 못했습니다.');error.status=response.status;throw error;}return result;
}
export async function refreshSession({expectedUserId=session.user?.id,expectedEpoch=sessionEpoch}={}){
 const isCurrent=()=>session.user?.id===expectedUserId&&sessionEpoch===expectedEpoch;
 try{const value=await api('/session');if(!isCurrent())return session;Object.assign(session,value,{online:value.online===true,authProvider:value.authProvider||'password',authMethod:value.authMethod||null});}
 catch{if(!isCurrent())return session;Object.assign(session,{online:false,user:null,csrf:null,authProvider:'password',authMethod:null});}
 if(publishedUserId!==session.user?.id){sessionEpoch++;publishedUserId=session.user?.id;}
 window.dispatchEvent(new CustomEvent('service-session'));return session;
}
export const sessionReady=refreshSession();
export function dialog(title,content,{wide=false,accountBound=true}={}){
 const ownerId=accountBound?session.user?.id:null,trigger=document.activeElement,element=document.createElement('dialog');element.className=`online-dialog ${wide?'is-wide':''}`;const titleId='online-dialog-title-'+crypto.randomUUID();element.setAttribute('aria-labelledby',titleId);
 element.innerHTML=`<div class="online-dialog-head"><h2 id="${titleId}">${esc(title)}</h2><button type="button" class="button" data-close aria-label="닫기">닫기</button></div><div class="online-dialog-body">${content}</div>`;
 const closeOnSessionChange=()=>{if(ownerId&&(!session.online||session.user?.id!==ownerId))element.close();};
 if(ownerId)window.addEventListener('service-session',closeOnSessionChange);
 document.body.append(element);element.querySelector('[data-close]').onclick=()=>element.close();element.addEventListener('click',e=>{if(e.target!==element)return;const r=element.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)element.close();});element.addEventListener('close',()=>{window.removeEventListener('service-session',closeOnSessionChange);element.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load();});element.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});});element.showModal();return element;
}
export const statusLine='<p class="online-status" role="status" aria-live="polite"></p>';
export function busy(form,value){form.querySelectorAll('button[type="submit"]').forEach(button=>{button.disabled=value;button.setAttribute('aria-busy',String(value));});}
export function showAccount({onSignOut}={}){
 if(!session.online){dialog('온라인 서비스 준비 중','<p>회원 가입과 온라인 제출을 준비하고 있습니다. 촬영 교육과 이 브라우저의 영상 기록은 지금 이용할 수 있습니다.</p>');return;}
 if(session.user){
  const user=session.user,isGoogle=['google','apple'].includes(session.authMethod),isApple=session.authMethod==='apple',d=dialog(user.forcePassword?'비밀번호 변경':'계정 관리',`<p>${esc(user.email)}</p>${isApple?'<p class="cloud-login-method">Apple로 로그인됨</p>':isGoogle?'<p class="cloud-login-method"><img src="../assets/brand/google-signin-g.png" alt="" width="18" height="18"><span>Google로 로그인됨</span></p>':''}${user.forcePassword?'<p class="online-notice">임시 비밀번호를 새 비밀번호로 변경해주세요.</p>':''}<form id="online-account-form" class="online-form"><label>이름<input name="name" required maxlength="60" value="${esc(user.name)}" autocomplete="name"></label>${isGoogle?'':`<label>현재 비밀번호<input name="currentPassword" type="password" autocomplete="current-password" ${user.forcePassword?'required':''}></label><label>새 비밀번호<input name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" ${user.forcePassword?'required':''}><small>변경할 때만 입력해주세요. 12자 이상</small></label>`}${statusLine}<button type="submit" class="button primary">저장</button></form><button type="button" class="button online-logout">로그아웃</button>`);
  const form=d.querySelector('form');form.onsubmit=async e=>{e.preventDefault();busy(form,true);try{const body=Object.fromEntries(new FormData(form));if(!body.newPassword){delete body.newPassword;delete body.currentPassword;}const result=await api('/account',{method:'PATCH',body});Object.assign(session,result);await refreshSession();d.close();}catch(e){form.querySelector('[role="status"]').textContent=e.message;}finally{busy(form,false);}};
  d.querySelector('.online-logout').onclick=async()=>{try{if(onSignOut)await onSignOut();else{await api('/auth/logout',{method:'POST'});await refreshSession();}d.close();}catch(e){form.querySelector('[role="status"]').textContent=e.message;}};return;
 }
 const d=dialog('60BASE 시작하기','<div class="online-auth-tabs" role="group" aria-label="회원 시작"><button type="button" aria-pressed="true" data-auth="login">로그인</button><button type="button" aria-pressed="false" data-auth="register">회원 가입</button></div><div id="online-auth-content"></div>');
 function render(mode){d.querySelectorAll('[data-auth]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.auth===mode)));d.querySelector('#online-auth-content').innerHTML=`<form class="online-form">${mode==='register'?'<label>이름<input name="name" autocomplete="name" required maxlength="60"></label>':''}<label>이메일<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>비밀번호<input name="password" type="password" autocomplete="${mode==='register'?'new-password':'current-password'}" required ${mode==='register'?'minlength="12"':''} maxlength="128"><small>12자 이상</small></label>${mode==='register'?'<label class="online-check"><input type="checkbox" name="adult" required>만 19세 이상입니다.</label><label class="online-check"><input type="checkbox" name="terms" required><a href="/studio/terms.html" target="_blank" rel="noopener">이용약관</a>에 동의합니다.</label><label class="online-check"><input type="checkbox" name="privacy" required><a href="/studio/privacy.html" target="_blank" rel="noopener">개인정보 안내</a>를 확인했습니다.</label>':'<p class="online-help">로그인에 문제가 있으면 60base.ai@gmail.com으로 문의해주세요.</p>'}${statusLine}<button type="submit" class="button primary">${mode==='register'?'가입하고 시작하기':'로그인'}</button></form>`;const form=d.querySelector('form');form.onsubmit=async e=>{e.preventDefault();busy(form,true);try{const body=Object.fromEntries(new FormData(form));for(const key of ['adult','terms','privacy'])if(key in body)body[key]=true;Object.assign(session,await api('/auth/'+mode,{method:'POST',body}));await refreshSession();d.close();if(session.user?.forcePassword)showAccount();}catch(e){form.querySelector('[role="status"]').textContent=e.message;}finally{busy(form,false);}};}
 d.querySelectorAll('[data-auth]').forEach(b=>b.onclick=()=>render(b.dataset.auth));render('login');
}
