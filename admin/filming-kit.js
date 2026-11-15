import {esc,statusLine,busy} from '../studio/online-api.js';
// 촬영 키트 배송 처리 (CONTRACT "Operator"). Delivery details are personal data: they stay in the page only,
// never in the address bar, browser storage or the console. Only the status tab goes into the hash.
const statuses=['address_required','preparing','shipped','canceled'],titles={address_required:'입력 대기',preparing:'발송 대기',shipped:'발송 완료',canceled:'취소'};
const rowActions={address_required:'알림 다시 보내기',preparing:'발송 처리',shipped:'보기',canceled:'보기'},dialogTitles={address_required:'배송 정보 입력 대기',preparing:'발송 처리',shipped:'발송 완료',canceled:'취소된 신청'};
const stampFormat=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}),dayFormat=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'});
const stamp=value=>value?stampFormat.format(new Date(value)):'—',day=value=>value?dayFormat.format(new Date(value)):'—';
const count=value=>(Number(value)||0).toLocaleString('ko-KR');
const phoneText=value=>String(value||'').replace(/^(\d{3})(\d{3,4})(\d{4})$/,'$1-$2-$3');
const addressText=c=>c.address1?`(${c.postcode}) ${c.address1}${c.address2?', '+c.address2:''}`:'';
const erased='<span class="admin-muted-text">삭제됨</span>',muted=text=>`<span class="admin-muted-text">${text}</span>`;
const memberCell=c=>c.memberName||c.memberEmail?`<strong>${esc(c.memberName)}</strong><small>${esc(c.memberEmail)}</small>`:muted('탈퇴한 회원');
const overdue=c=>c.status==='address_required'&&c.overdue===true;
const chip=c=>`<span class="admin-stage-chip" data-kit-status="${overdue(c)?'overdue':esc(c.status)}">${overdue(c)?'기한 지남':esc(titles[c.status]||c.status)}</span>${overdue(c)?'<small>입력 대기</small>':''}`;
export const kitRouteStatus=()=>{const [page,query]=location.hash.slice(1).split('?'),status=new URLSearchParams(query).get('status');return page==='kit'&&statuses.includes(status)?status:'all';};
export function createFilmingKit({main,api,dialog,reload,rerender,heading,kpi,exportButton,tableMarkup,rowData,bindTableSort,filters}){
 let data=null,notice='';
 function matches(c,query){
  const text=query.trim().toLocaleLowerCase('ko-KR'),digits=text.replace(/\D/g,'');if(!text)return true;
  if([c.memberName,c.memberEmail,c.recipient,c.phone,c.trackingNumber,c.id].some(value=>String(value||'').toLocaleLowerCase('ko-KR').includes(text)))return true;
  return digits.length>=4&&/^[\d\s-]+$/.test(text)&&[c.phone,c.trackingNumber].some(value=>String(value||'').replace(/\D/g,'').includes(digits));
 }
 function row(c){
  const recipient=c.purged?erased:c.recipient?`${esc(c.recipient)}<small>${esc(phoneText(c.phone))}</small>`:`<small>${c.status==='address_required'?'아직 입력 전':'입력하지 않음'}</small>`;
  const address=c.purged?erased:c.address1?`${esc(addressText(c))}${c.memo?`<small>${esc(c.memo)}</small>`:''}`:`<small>${c.status!=='address_required'?'입력하지 않음':overdue(c)?'기한 지남':'기한 '+day(c.dueAt)}</small>`;
  const tracking=c.status==='shipped'&&c.trackingNumber?`<small>${esc(c.carrier)} ${esc(c.trackingNumber)}</small>`:'';
  return rowData([`${stamp(c.claimedAt)}<small>${esc(c.id)}</small>`,memberCell(c),recipient,address,chip(c)+tracking,`<button type="button" class="button" data-admin-action="kit" data-id="${esc(c.id)}">${rowActions[c.status]||'보기'}</button>`],[c.claimedAt,c.memberName,c.purged?'':c.recipient,c.purged?'':addressText(c),statuses.indexOf(c.status)*2+(overdue(c)?0:1),'']);
 }
 function results(){
  const status=kitRouteStatus(),inTab=data.claims.filter(c=>status==='all'||c.status===status),selected=inTab.filter(c=>matches(c,filters().query));
  const headers=['신청 일시','회원','받는 분 · 연락처','주소','상태','처리'];
  return `<p class="admin-count" role="status" aria-live="polite">${selected.length.toLocaleString('ko-KR')}건 / ${inTab.length.toLocaleString('ko-KR')}건${data.claims.length>=1000?' · 최근 1,000건까지 표시':''}</p>${selected.length?tableMarkup('촬영 키트 신청',headers,selected.map(row)):`<div class="online-empty"><h3>${inTab.length?'검색 조건에 맞는 신청이 없습니다.':'이 상태의 신청이 없습니다.'}</h3></div>`}`;
 }
 function bindResults(){main.querySelectorAll('[data-kit-results] [data-admin-action="kit"]').forEach(button=>button.onclick=()=>open(button.dataset.id));bindTableSort();}
 function render(next){
  data=next;const shown=notice,status=kitRouteStatus(),counts=data.counts||{},today=data.today||{},waitingLate=data.claims.filter(overdue).length,total=statuses.reduce((sum,key)=>sum+(Number(counts[key])||0),0);
  const tab=(key,label,value)=>`<button type="button" class="button" id="admin-kit-tab-${key}" data-kit-tab="${key}" aria-pressed="${status===key}"><span>${label}</span><strong>${count(value)}</strong><span class="sr-only">건</span></button>`;
  main.innerHTML=heading('촬영 키트','신청이 확정된 참여자의 배송 정보를 확인하고 발송을 처리합니다.',exportButton('kit'))+`<div class="online-kpis">${kpi('오늘 신청',`${count(today.claimed)} / ${count(today.claimLimit)}`,esc(today.eventDay||''))}${kpi('배송 정보 입력 대기',count(counts.address_required),waitingLate?`기한 지남 ${count(waitingLate)}건`:`확정 후 ${count(data.dueDays)}일 안에 입력`)}${kpi('발송 대기',count(counts.preparing),'배송 정보 입력 완료')}${kpi('발송 완료',count(counts.shipped),'송장번호 등록')}</div>
  <div class="admin-tabs admin-stage-tabs" role="group" aria-label="배송 상태별 보기">${tab('all','전체',total)}${statuses.map(key=>tab(key,titles[key],counts[key])).join('')}</div>
  <div class="online-filter-row"><label class="sr-only" for="admin-search">이름, 이메일, 받는 분, 연락처, 송장번호, 신청번호 검색</label><input id="admin-search" class="online-filter admin-table-search" type="search" placeholder="이름, 이메일, 연락처, 송장번호, 신청번호" value="${esc(filters().query)}" autocomplete="off"><button type="button" class="button" id="admin-search-reset" ${filters().query?'':'disabled'}>검색 초기화</button></div>
  ${shown?`<p class="admin-settings-change" role="status" tabindex="-1" data-kit-notice>${esc(shown)}</p>`:''}<div data-kit-results>${results()}</div><p class="admin-data-legend">목록 조회는 10분에 한 번, CSV 내려받기는 매번 변경 기록에 남습니다. 배송 정보와 운영 메모는 발송·취소 ${count(data.retentionDays)}일 뒤 삭제됩니다.</p>`;
  notice='';const search=main.querySelector('#admin-search'),reset=main.querySelector('#admin-search-reset'),box=main.querySelector('[data-kit-results]');
  const update=()=>{filters().query=search.value;reset.disabled=!search.value;box.innerHTML=results();bindResults();};
  search.oninput=update;reset.onclick=()=>{search.value='';update();search.focus();};
  main.querySelectorAll('[data-kit-tab]').forEach(button=>button.onclick=()=>{const key=button.dataset.kitTab;history.replaceState(null,'',location.pathname+location.search+(key==='all'?'#kit':'#kit?status='+key));rerender();main.querySelector('#admin-kit-tab-'+key)?.focus();});
  bindResults();
 }
 function open(id){
  const c=data?.claims.find(item=>item.id===id);if(!c)return;notice='';
  const editable=['address_required','preparing'].includes(c.status),values={recipient:c.recipient,phone:phoneText(c.phone),address:addressText(c)};
  const value=(text,copy,label)=>c.purged?erased:text?`<span class="admin-kit-value"><span>${esc(text)}</span>${copy?`<button type="button" class="button" data-kit-copy="${copy}" aria-label="${label} 복사">복사</button>`:''}</span>`:muted(c.status==='address_required'?'아직 입력 전':'—');
  const item=(label,content)=>`<div><dt>${label}</dt><dd>${content}</dd></div>`;
  const details=[item('받는 분',value(c.recipient,'recipient','받는 분')),item('연락처',value(values.phone,'phone','연락처')),item('주소',value(values.address,'address','주소')),item('요청사항',c.purged?erased:esc(c.memo)||muted('없음')),item('회원',c.memberName||c.memberEmail?`${esc(c.memberName)}<br><small>${esc(c.memberEmail)}</small>`:muted('탈퇴한 회원')),item('신청',`${stamp(c.claimedAt)}<br><small>${esc(c.id)}</small>`),item('상태',chip(c)),
   c.status==='address_required'?item('입력 기한',`${day(c.dueAt)}${overdue(c)?' · 기한 지남':''}`):'',c.submittedAt?item('배송 정보 입력',stamp(c.submittedAt)):'',c.remindedAt?item('알림 다시 보냄',stamp(c.remindedAt)):'',
   c.status==='shipped'?item('발송',`${esc(c.carrier)} ${esc(c.trackingNumber)}<br><small>${stamp(c.shippedAt)}</small>`):'',c.status==='canceled'?item('취소',`${stamp(c.canceledAt)}${c.cancelReason?`<br><small>${esc(c.cancelReason)}</small>`:''}`):''].join('');
  const shipForm=['preparing','shipped'].includes(c.status)&&!c.purged?`<form class="online-form" data-kit-ship novalidate><h3>${c.status==='shipped'?'택배사·송장번호 수정':'발송 정보'}</h3><label>택배사<select name="carrier" required><option value="">택배사 선택</option>${(data.carriers||[]).map(name=>`<option value="${esc(name)}" ${name===c.carrier?'selected':''}>${esc(name)}</option>`).join('')}</select></label><label>송장번호<input name="trackingNumber" required maxlength="30" autocomplete="off" spellcheck="false" value="${esc(c.trackingNumber)}" aria-describedby="admin-kit-tracking-help"></label><p class="admin-review-field-help" id="admin-kit-tracking-help">숫자·영문·하이픈 8–30자. ${c.status==='shipped'?'수정해도 참여자에게 알림을 다시 보내지 않습니다.':'저장하면 참여자에게 택배사와 송장번호를 알립니다. 아래 운영 메모도 함께 저장됩니다.'}</p>${statusLine}<button type="submit" class="button primary">${c.status==='shipped'?'택배사·송장번호 수정':'발송 완료로 저장 · 참여자에게 알림'}</button></form>`:c.status==='preparing'?'<p class="online-notice">배송 정보가 삭제되어 발송할 수 없습니다. 필요하면 신청을 취소해주세요.</p>':'';
  const remindForm=c.status==='address_required'?`<form class="online-form" data-kit-remind><h3>배송 정보 입력 요청</h3><p class="admin-info-line">참여자에게 입력 알림을 다시 보내고 입력 기한을 오늘부터 ${count(data.dueDays)}일 뒤로 늘립니다. 지금 기한이 더 늦으면 그대로 둡니다.</p>${statusLine}<button type="submit" class="button primary">알림 다시 보내기</button></form>`:'';
  const noteForm=`<form class="online-form" data-kit-note><label>운영 메모 (참여자에게 보이지 않음)<textarea name="adminNote" maxlength="500" rows="3" placeholder="예: 11/17 오전 편의점 접수" aria-describedby="admin-kit-note-error">${esc(c.adminNote)}</textarea></label><p class="admin-review-field-help admin-kit-field-error" id="admin-kit-note-error" data-kit-field-error="adminNote" hidden></p>${statusLine}<button type="submit" class="button">메모 저장</button></form>`;
  const cancelForm=editable?`<div class="admin-kit-cancel"><button type="button" class="button danger" data-kit-cancel-open aria-expanded="false" aria-controls="admin-kit-cancel">신청 취소</button><form class="online-form" id="admin-kit-cancel" data-kit-cancel novalidate hidden><label>취소 사유 · 3–200자<input name="reason" required maxlength="200" autocomplete="off" aria-describedby="admin-kit-reason-help admin-kit-reason-error"></label><p class="admin-review-field-help" id="admin-kit-reason-help">한 줄로 입력해주세요. 취소할 때 위 운영 메모도 함께 저장됩니다.</p><p class="admin-review-field-help admin-kit-field-error" id="admin-kit-reason-error" data-kit-field-error="reason" hidden></p><p class="admin-settings-change" data-kit-cancel-confirm hidden>이 신청을 취소합니다. 되돌릴 수 없고 참여자에게 취소 알림이 갑니다. 위 운영 메모도 함께 저장됩니다.</p>${statusLine}<div class="admin-review-actions"><button type="button" class="button" data-kit-cancel-back hidden>돌아가기</button><button type="submit" class="button danger" data-kit-cancel-submit>다음 · 취소 확인</button></div></form></div>`:'';
  const d=dialog(`${dialogTitles[c.status]||'촬영 키트 신청'} · ${c.memberName||'탈퇴한 회원'}`,`<div class="admin-ticket-layout"><section class="admin-ticket-context"><span class="admin-eyebrow">배송 정보</span><dl class="admin-detail-grid">${details}</dl><p class="online-status" role="status" aria-live="polite" data-kit-copy-status></p></section><section class="admin-ticket-compose">${remindForm}${shipForm}${noteForm}${cancelForm}</section></div>`,{wide:true});
  const noteField=d.querySelector('[data-kit-note] textarea'),copyStatus=d.querySelector('[data-kit-copy-status]');
  // A 400 about the note or the cancel reason is shown under that field; the server message names the field.
  const fieldError=(name,message)=>{const input=d.querySelector(`[name="${name}"]`),slot=d.querySelector(`[data-kit-field-error="${name}"]`);if(!input||!slot)return;slot.textContent=message;slot.hidden=!message;if(message)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');};
  noteField.addEventListener('input',()=>fieldError('adminNote',''));
  d.querySelectorAll('[data-kit-copy]').forEach(button=>button.onclick=async()=>{const label=button.getAttribute('aria-label').replace(/ 복사$/,'');try{await navigator.clipboard.writeText(values[button.dataset.kitCopy]);copyStatus.textContent='복사했습니다 · '+label;}catch{copyStatus.textContent='복사하지 못했습니다 · '+label+'. 직접 선택해 복사해주세요.';}});
  async function act(form,body,done){
   const status=form.querySelector('[role="status"]');busy(form,true);status.textContent='저장하고 있습니다.';
   try{
    await api('/admin/filming-kit-claims/'+encodeURIComponent(c.id),{method:'PATCH',body:{...body,expectedUpdatedAt:c.updatedAt}});
    if(!d.isConnected)return;notice=`${c.id} · ${done}`;d.close();await reload();main.querySelector('[data-kit-notice]')?.focus();
   }catch(error){
    if(error.name==='AbortError'||!form.isConnected)return;
    if(error.status===400){const field=/메모/.test(error.message)?'adminNote':/취소 사유/.test(error.message)?'reason':'';if(field)fieldError(field,error.message);}
    status.textContent=error.status===409?`${error.message} 입력한 내용은 그대로 두었습니다. 이 창을 닫고 목록을 새로고침한 뒤 다시 처리해주세요.`:error.message;status.tabIndex=-1;status.focus();
   }finally{busy(form,false);}
  }
  d.querySelector('[data-kit-remind]')?.addEventListener('submit',event=>{event.preventDefault();void act(event.target,{action:'remind'},'입력 알림을 다시 보냈습니다.');});
  d.querySelector('[data-kit-note]').addEventListener('submit',event=>{event.preventDefault();if(!event.target.reportValidity())return;void act(event.target,{action:'note',adminNote:noteField.value},'운영 메모를 저장했습니다.');});
  const ship=d.querySelector('[data-kit-ship]');
  if(ship)ship.onsubmit=event=>{
   event.preventDefault();const tracking=ship.elements.trackingNumber,number=tracking.value.replace(/\s+/g,'');tracking.value=number;
   tracking.setCustomValidity(/^[0-9A-Za-z-]{8,30}$/.test(number)?'':'송장번호는 숫자·영문·하이픈 8–30자로 입력해주세요.');ship.elements.carrier.setCustomValidity(ship.elements.carrier.value?'':'택배사를 선택해주세요.');
   if(!ship.reportValidity())return;
   void act(ship,{action:'ship',carrier:ship.elements.carrier.value,trackingNumber:number,adminNote:noteField.value},c.status==='shipped'?'택배사·송장번호를 수정했습니다.':'발송 완료로 저장하고 참여자에게 알렸습니다.');
  };
  ship?.addEventListener('input',event=>event.target.setCustomValidity?.(''));
  const cancel=d.querySelector('[data-kit-cancel]');
  if(cancel){
   const opener=d.querySelector('[data-kit-cancel-open]'),reason=cancel.elements.reason,confirm=cancel.querySelector('[data-kit-cancel-confirm]'),back=cancel.querySelector('[data-kit-cancel-back]'),submit=cancel.querySelector('[data-kit-cancel-submit]');let confirming=false;
   const step=next=>{confirming=next;reason.readOnly=next;confirm.hidden=!next;back.hidden=!next;submit.textContent=next?'신청 취소 확정':'다음 · 취소 확인';cancel.querySelector('[role="status"]').textContent='';(next?submit:reason).focus();};
   opener.onclick=()=>{cancel.hidden=!cancel.hidden;opener.setAttribute('aria-expanded',String(!cancel.hidden));if(!cancel.hidden)reason.focus();};
   const oneLine=text=>text.replace(/\s*[\r\n]+\s*/g,' ');
   reason.oninput=()=>{reason.setCustomValidity('');fieldError('reason','');};back.onclick=()=>step(false);
   reason.addEventListener('paste',event=>{const text=event.clipboardData?.getData('text');if(!text||reason.readOnly)return;event.preventDefault();reason.setRangeText(oneLine(text),reason.selectionStart,reason.selectionEnd,'end');reason.dispatchEvent(new Event('input',{bubbles:true}));});
   cancel.onsubmit=event=>{
    event.preventDefault();const text=oneLine(reason.value).trim();reason.value=text;
    if(!confirming){reason.setCustomValidity(text.length>=3&&text.length<=200?'':'취소 사유를 3자 이상 200자 이하로 입력해주세요.');if(cancel.reportValidity())step(true);return;}
    void act(cancel,{action:'cancel',reason:text,adminNote:noteField.value},'신청을 취소했습니다.');
   };
  }
 }
 return {render,open};
}
