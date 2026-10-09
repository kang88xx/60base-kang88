const labels={pending:'접수됨',processing:'처리 중',blocked:'확인 필요',completed:'삭제 완료'};
export async function mountAccountDeletions(host,{api}){
 const heading=document.createElement('h2');heading.textContent='계정 삭제 요청';
 const description=document.createElement('p');description.textContent='접수와 삭제 완료는 다릅니다. 계정·영상·포인트 삭제는 되돌릴 수 없습니다. 요청자를 확인하고 접수 후 7일 이내에 처리하세요. 설정이 부족하면 확인 필요 상태로 남습니다.';
 const status=document.createElement('p');status.setAttribute('role','status');
 const list=document.createElement('div');host.replaceChildren(heading,description,status,list);
 async function refresh(){
  status.textContent='삭제 요청을 불러오는 중입니다.';
  try{
   const data=await api('/admin/account-deletions');if(!host.isConnected)return;
   list.replaceChildren();status.textContent=data.deletions.length?'':'접수된 삭제 요청이 없습니다.';
   for(const item of data.deletions){
    const section=document.createElement('section');section.className='online-panel';
    const title=document.createElement('h3');title.textContent=`${labels[item.status]||item.status} · ${item.id}`;
    const overdue=item.status!=='completed'&&item.dueAt&&Date.now()>Date.parse(item.dueAt);
    const detail=document.createElement('p');detail.textContent=`회원 ${item.userId} · 접수 ${item.requestedAt} · 처리 기한 ${item.dueAt||'확인 필요'}${overdue?' · 기한 초과':''} · 단계 ${item.stage}${item.lastError?' · '+item.lastError:''}`;
    section.append(title,detail);
    if(item.status!=='completed'){
     const form=document.createElement('form');form.className='online-form';
     const label=document.createElement('label');label.textContent='삭제 요청 번호를 그대로 입력해 처리 대상 확인';
     const input=document.createElement('input');input.required=true;input.autocomplete='off';input.setAttribute('aria-label',`${item.id} 삭제 처리 확인 번호`);label.append(input);
     const button=document.createElement('button');button.type='submit';button.className='button';button.textContent='확인한 삭제 요청 처리';
     const result=document.createElement('p');result.setAttribute('role','status');
     form.append(label,button,result);section.append(form);
     form.onsubmit=async event=>{
      event.preventDefault();if(input.value.trim()!==item.id){result.textContent='삭제 요청 번호가 일치하지 않습니다.';return;}
      button.disabled=true;result.textContent='삭제 상태를 확인하고 있습니다.';
      try{const response=await api(`/admin/account-deletions/${encodeURIComponent(item.id)}/process`,{method:'POST',body:{confirm:item.id}});if(!host.isConnected)return;await refresh();if(host.isConnected)status.textContent=response.deletion.status==='completed'?'계정 삭제가 완료되었습니다.':'아직 삭제 완료가 아닙니다. 요청의 상태와 처리 단계를 확인하세요.';}
      catch(error){if(form.isConnected)result.textContent=error.message;}
      finally{if(button.isConnected)button.disabled=false;}
     };
    }
    list.append(section);
   }
  }catch(error){if(host.isConnected)status.textContent=error.message;}
 }
 await refresh();
}
