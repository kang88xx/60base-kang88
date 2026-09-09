import { products, banks, formatMoney, reviewStatusLabel, getMission } from './data.js';
import { getClips } from './store.js';
import { getServiceState, submitClip, startReview, reviewSubmission, savePayoutAccount, deletePayoutAccount, requestWithdrawal, resolveWithdrawal, changeCartQuantity, checkoutCart, cancelOrder } from './service-store.js';
import { openClip } from './capture.js';
import { icon, escapeHTML as esc } from './ui.js';

const money = value => formatMoney(Number(value) || 0);
const date = value => value ? new Intl.DateTimeFormat('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value)) : '—';
const empty = (title, body, name='receipt') => `<div class="service-empty">${icon(name,30)}<h3>${title}</h3><p>${body}</p></div>`;
const note = '<div class="service-demo-note">'+icon('help',17)+'<span>심사·수익 시연 환경입니다. 금액은 예시이며 실제 결제·은행 송금·배송은 진행되지 않아요.</span></div>';
const badge = status => `<span class="review-badge ${esc(status)}">${esc(reviewStatusLabel(status))}</span>`;
const message = (root,text,error=false) => { const target=root.querySelector('[data-service-message]'); if(target){target.textContent=text;target.classList.toggle('is-error',error);} };
const errorText = error => error?.message || '처리하지 못했어요. 다시 시도해주세요.';
let activeDialog;

function dialog(title,content,wide=false) {
  activeDialog?.close();
  const element=document.createElement('dialog');element.className=`service-dialog${wide?' wide':''}`;
  const titleId=`service-title-${crypto.randomUUID()}`;element.setAttribute('aria-labelledby',titleId);
  element.innerHTML=`<header class="service-dialog-head"><div><span class="eyebrow">몸짓 · BASE60</span><h2 id="${titleId}">${title}</h2></div><button class="icon-button" data-service-close aria-label="닫기">${icon('close')}</button></header><div class="service-dialog-body">${content}</div>`;
  element.querySelector('[data-service-close]').onclick=()=>element.close();
  element.addEventListener('close',()=>{if(activeDialog===element)activeDialog=null;element.remove();},{once:true});
  element.addEventListener('cancel',event=>{if(element.dataset.busy==='true')event.preventDefault();});
  document.body.append(element);activeDialog=element;element.showModal();return element;
}
async function perform(root,action,onSuccess) {
  if(root.dataset.busy==='true')return;
  root.dataset.busy='true';
  const controls=[...root.querySelectorAll('button,input,select,textarea')].map(element=>[element,element.disabled]);
  controls.forEach(([element])=>element.disabled=true);
  try {const result=await action();await onSuccess?.(result);}
  catch(error){message(root,errorText(error),true);}
  finally{root.dataset.busy='false';controls.forEach(([element,disabled])=>element.disabled=disabled);}
}
const statusLine='<p class="service-message" data-service-message role="status" aria-live="polite"></p>';
const accountText=account=>account?`${esc(account.bankName || banks.find(bank=>bank.code===account.bankCode)?.name || account.bankCode)} · •••• ${esc(account.last4)}`:'출금 계좌를 등록해주세요';

export function renderWallet(container,state) {
  if(!container)return;
  const {wallet,account,payouts=[],ledger=[]}=state;
  container.innerHTML=`${note}<div class="wallet-grid"><section class="wallet-primary"><span class="wallet-caption">출금 가능 금액 · 시연</span><strong class="wallet-amount" data-wallet-available>${money(wallet.available)}</strong><p>통과한 영상의 보상이 차곡차곡 쌓여요.</p><div class="service-actions"><button class="button" data-service="withdraw">출금 신청 ${icon('arrow',17)}</button><button class="wallet-account-link" data-service="account">${icon('bank',17)} ${accountText(account)}</button></div></section><section class="wallet-breakdown"><div><span>누적 적립 수익</span><strong>${money(wallet.totalEarned)}</strong></div><div><span>심사 중 예상 보상</span><strong>${money(wallet.pendingReward)}</strong></div><div><span>출금 처리 중</span><strong>${money(wallet.pendingWithdrawal)}</strong></div><div><span>누적 출금 · 시연</span><strong>${money(wallet.totalWithdrawn)}</strong></div><div><span>상점에서 사용</span><strong>${money(wallet.totalSpent)}</strong></div></section></div>
  <section class="service-panel account-panel"><div class="service-panel-title"><div><span class="eyebrow">출금 계좌</span><h3>${accountText(account)}</h3><p>${account?`${esc(account.holder)} · 끝 4자리만 저장된 시연 계좌`:'은행과 표시용 계좌 정보를 준비해요.'}</p></div><button class="button" data-service="account">${account?'계좌 관리':'계좌 등록'}</button></div></section>
  <section class="service-panel"><div class="service-panel-title"><h3>출금 신청 내역</h3><span class="service-count">${payouts.length}건</span></div>${payouts.length?`<div class="service-list">${payouts.map(payout=>`<article class="service-row"><span class="service-row-icon">${icon('bank')}</span><div class="service-row-copy"><strong>${money(payout.amount)}</strong><small>${date(payout.createdAt)} · ${accountText(payout.account || payout.accountSnapshot)}</small></div><span class="review-badge ${payout.status==='completed'?'approved':payout.status==='failed'?'rejected':'submitted'}">${payout.status==='completed'?'출금 완료 · 시연':payout.status==='failed'?'실패 · 금액 반환':'처리 대기'}</span></article>`).join('')}</div>`:empty('아직 출금 신청이 없어요','통과한 영상의 적립 수익을 확인한 뒤 신청할 수 있어요.','bank')}</section>
  <section class="service-panel"><div class="service-panel-title"><h3>수익·사용 내역</h3><span class="service-count">${ledger.length}건</span></div>${ledger.length?`<div class="service-list">${ledger.map(entry=>`<article class="service-row"><span class="service-row-icon ${entry.amount>0?'positive':''}">${icon(entry.amount>0?'plus':'receipt')}</span><div class="service-row-copy"><strong>${esc(entry.description || entry.type)}</strong><small>${date(entry.createdAt)}</small></div><strong class="ledger-amount ${entry.amount>0?'positive':''}">${entry.amount>0?'+':''}${money(entry.amount)}</strong></article>`).join('')}</div>`:empty('첫 번째 적립을 기다리고 있어요','영상을 제출하고 심사에 통과하면 보상 내역이 생겨요.')}</section>${statusLine}<button class="service-operator-link" data-service="operator">${icon('settings',16)} 운영자 시연 · 심사와 출금 결과 확인</button>`;
  container.onclick=event=>{const action=event.target.closest('[data-service]')?.dataset.service;if(action==='account')void openAccount();if(action==='withdraw')void openWithdraw();if(action==='operator')void openReviewDemo();};
}

export async function openAccount() {
  const element=dialog('출금 계좌 관리',`<p role="status">계좌 정보를 불러오고 있어요…</p>${statusLine}`);
  try {
    const {account}=await getServiceState();if(!element.open)return;
    element.querySelector('.service-dialog-body').innerHTML=`${note}<form id="payout-account-form" class="service-form"><label>은행<select name="bankCode" required>${banks.map(bank=>`<option value="${esc(bank.code)}" ${account?.bankCode===bank.code?'selected':''}>${esc(bank.name)}</option>`).join('')}</select></label><label>표시 이름<input name="holder" maxlength="24" value="${esc(account?.holder || '시연 참여자')}" autocomplete="off" required></label><label>계좌 끝 4자리 · 시연용<input name="last4" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" minlength="4" value="${esc(account?.last4 || '')}" placeholder="예: 1234" autocomplete="off" required></label><p class="service-form-hint">실제 계좌번호 전체는 입력하지 마세요. 현재는 표시용 끝 4자리만 저장하며 예금주·계좌 인증은 진행되지 않아요.</p>${statusLine}<div class="service-actions"><button class="button primary" type="submit">시연 계좌 저장</button>${account?'<button class="button danger" type="button" data-delete-account>계좌 삭제</button>':''}</div></form>`;
    const form=element.querySelector('form');
    form.onsubmit=event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form));void perform(element,()=>savePayoutAccount(values),()=>element.close());};
    element.querySelector('[data-delete-account]')?.addEventListener('click',()=>void perform(element,()=>deletePayoutAccount(),()=>element.close()));
  }catch(error){message(element,errorText(error),true);}
}

export async function openWithdraw() {
  const element=dialog('출금 신청',`<p role="status">출금 가능 금액을 확인하고 있어요…</p>${statusLine}`);
  try {
    const {wallet,account}=await getServiceState();if(!element.open)return;
    const key=crypto.randomUUID();
    element.querySelector('.service-dialog-body').innerHTML=`${note}<div class="withdraw-summary"><span>출금 가능 · 시연</span><strong>${money(wallet.available)}</strong><small>${accountText(account)}</small></div>${!account?`<p class="service-form-hint">먼저 출금 계좌를 등록해주세요.</p><button class="button primary" data-add-account>계좌 등록</button>`:`<form id="withdraw-form" class="service-form"><label>출금 신청 금액 (원)<div class="service-input-action"><input name="amount" type="number" min="1000" max="${wallet.available}" step="1" inputmode="numeric" placeholder="1,000원 이상" required><button class="button" type="button" data-all>전액</button></div></label><p class="service-form-hint">최소 1,000원 · 수수료 0원은 시연용 조건입니다. 신청 금액은 처리 결과가 정해질 때까지 따로 보관돼요.</p><label class="service-check"><input type="checkbox" required><span>실제 계좌 이체가 아닌 출금 흐름 시연임을 확인했어요.</span></label>${statusLine}<button class="button primary" type="submit" ${wallet.available<1000?'disabled':''}>출금 신청 시연 ${icon('arrow',16)}</button>${wallet.available<1000?'<p class="service-form-hint">출금 가능 금액이 1,000원 이상일 때 신청할 수 있어요.</p>':''}</form>`}`;
    element.querySelector('[data-add-account]')?.addEventListener('click',()=>{element.close();void openAccount();});
    const form=element.querySelector('form');if(!form)return;
    element.querySelector('[data-all]').onclick=()=>{form.elements.amount.value=wallet.available;};
    form.onsubmit=event=>{event.preventDefault();const amount=Number(form.elements.amount.value);void perform(element,()=>requestWithdrawal({amount,idempotencyKey:key,expectedAccount:{bankCode:account.bankCode,holder:account.holder,last4:account.last4}}),()=>{element.querySelector('.service-dialog-body').innerHTML=`<div class="service-success">${icon('checkCircle',42)}<h3>출금 신청을 기록했어요</h3><strong>${money(amount)}</strong><p>시연 처리 대기 상태예요.<br>실제 은행 송금은 진행되지 않았어요.</p><button class="button primary" data-finish>내역 확인</button></div>`;element.querySelector('[data-finish]').onclick=()=>element.close();});};
  }catch(error){message(element,errorText(error),true);}
}

export function renderReviews(container,state,clips=[]) {
  if(!container)return;
  const latest=new Map();for(const submission of state.submissions)if(!latest.has(submission.clipId))latest.set(submission.clipId,submission);
  const real=clips.filter(clip=>!clip.example);
  container.innerHTML=`${note}<ol class="review-flow"><li>${icon('upload')}<span>영상 제출</span></li><li>${icon('search')}<span>심사 대기·검토</span></li><li>${icon('checkCircle')}<span>통과 후 수익 적립</span></li></ol>${real.length?`<div class="review-cards">${real.map(clip=>{const submission=latest.get(clip.id),history=state.submissions.filter(item=>item.clipId===clip.id);return `<article class="review-card" data-review-clip="${esc(clip.id)}"><div class="review-card-head"><span class="service-row-icon">${icon('video',23)}</span><div><h3>${esc(clip.title)}</h3><p>${esc(getMission(clip.missionId).title)} · ${submission?`${submission.attempt}번째 심사`:'제출 전'}</p></div>${submission?badge(submission.status):'<span class="review-badge">제출 전</span>'}</div><div class="review-card-reward"><span>${submission?.status==='approved'?'적립된 보상 · 시연':'통과 시 예상 보상 · 예시'}</span><strong>${money(submission?.reward ?? getMission(clip.missionId).reward)}</strong></div>${submission?.status==='rejected'?`<div class="review-reason"><strong>반려 사유</strong><p>${esc(submission.reason)}</p><small>내용을 확인하고 같은 영상의 재검토를 요청하거나, 수정한 영상을 새로 올려주세요.</small></div>`:''}<div class="service-actions"><button class="button" data-service="clip" data-id="${esc(clip.id)}">영상·상세 보기</button>${!submission||submission.status==='rejected'?`<button class="button primary" data-service="submit" data-id="${esc(clip.id)}">${submission?'다시 심사 요청':'심사에 제출'} ${icon('arrow',15)}</button>`:''}</div>${history.length>1?`<details class="review-history"><summary>이전 심사 이력 ${history.length-1}건</summary>${history.slice(1).map(item=>`<p>${item.attempt}차 · ${esc(reviewStatusLabel(item.status))} · ${date(item.reviewedAt || item.createdAt)}${item.reason?`<br>${esc(item.reason)}`:''}</p>`).join('')}</details>`:''}</article>`;}).join('')}</div>`:empty('제출할 영상을 기다리고 있어요','촬영하거나 영상을 가져온 뒤 심사에 제출해보세요. 영상이 없는 예시 기록은 심사할 수 없어요.','video')}${statusLine}<button class="service-operator-link" data-service="operator">${icon('settings',16)} 운영자 시연 · 심사 결과 바꿔보기</button>`;
  container.onclick=event=>{const button=event.target.closest('[data-service]');if(!button)return;if(button.dataset.service==='clip')void openClip(button.dataset.id);if(button.dataset.service==='operator')void openReviewDemo();if(button.dataset.service==='submit')void perform(container,()=>submitClip(button.dataset.id),async()=>{renderReviews(container,await getServiceState(),await getClips());message(container,'심사 대기로 기록했어요. 운영자 시연에서 결과를 확인할 수 있어요.');});};
}

function equipmentArt(product,index) {
  const drawings=[
    '<ellipse cx="135" cy="101" rx="79" ry="48" fill="none" stroke="#172026" stroke-width="18"/><path d="M135 49v102" stroke="#172026" stroke-width="15"/><rect x="98" y="65" width="74" height="75" rx="14" fill="#f7f8fa" stroke="#172026" stroke-width="5"/><rect x="107" y="78" width="56" height="36" rx="7" fill="#254cf2"/><circle cx="135" cy="125" r="4" fill="#172026"/>',
    '<rect x="94" y="23" width="81" height="116" rx="16" fill="#172026"/><rect x="101" y="31" width="67" height="99" rx="11" fill="#f7f8fa"/><rect x="99" y="83" width="79" height="19" rx="8" fill="#254cf2"/><rect x="123" y="100" width="25" height="78" rx="12" fill="#254cf2"/><circle cx="113" cy="43" r="5" fill="#172026"/>',
    '<rect x="100" y="27" width="71" height="84" rx="10" fill="#172026"/><rect x="107" y="35" width="57" height="60" rx="6" fill="#f7f8fa"/><path d="M135 111v44m0-20-43 43m43-43 44 43" stroke="#172026" stroke-width="11" stroke-linecap="round"/><circle cx="136" cy="64" r="16" fill="#254cf2"/>',
    '<rect x="69" y="50" width="132" height="104" rx="24" fill="#172026"/><path d="M112 51V36h48v15" stroke="#172026" stroke-width="10" fill="none"/><rect x="82" y="65" width="106" height="71" rx="14" fill="#f7f8fa"/><path d="M118 82h35v37h-35z" fill="#254cf2"/><path d="M100 98h70M135 67v66" stroke="#254cf2" stroke-width="12"/>'
  ];
  return `<div class="equipment-art tone-${index%4}"><svg viewBox="0 0 270 205" aria-hidden="true"><circle cx="208" cy="42" r="48" fill="#fff" opacity=".32"/>${drawings[index%drawings.length]}</svg><span>${esc(product.category || '촬영 장비')}</span></div>`;
}
function cartItems(state) {return state.cart.map(item=>({...item,product:products.find(product=>product.id===item.productId)})).filter(item=>item.product);}

export function renderShop(container,state) {
  if(!container)return;
  const items=cartItems(state),total=items.reduce((sum,item)=>sum+item.product.price*item.quantity,0);
  container.innerHTML=`${note}<div class="shop-intro"><div><span class="eyebrow">촬영을 조금 더 편하게</span><h2>좋은 기록을 돕는 작은 도구들.</h2><p>두 손은 자유롭게, 화면은 안정적으로. 가격과 상품은 시연용 구성입니다.</p></div>${icon('package',45)}</div><div class="shop-layout"><div class="product-grid">${products.map((product,index)=>`<article class="product-card">${equipmentArt(product,index)}<div class="product-copy"><h3>${esc(product.name)}</h3><p>${esc(product.description)}</p><div class="product-price"><strong>${money(product.price)}</strong><small>예시 가격</small></div><button class="button" data-service="add" data-id="${esc(product.id)}">장바구니 담기 ${icon('plus',17)}</button></div></article>`).join('')}</div><aside class="cart-panel service-panel"><div class="service-panel-title"><h3>장바구니</h3><span class="service-count">${items.reduce((sum,item)=>sum+item.quantity,0)}개</span></div>${items.length?`<div class="cart-items">${items.map(item=>`<article class="cart-item"><div><strong>${esc(item.product.name)}</strong><small>${money(item.product.price)}</small></div><div class="quantity-control"><button data-service="decrease" data-id="${esc(item.productId)}" aria-label="${esc(item.product.name)} 수량 줄이기">−</button><span>${item.quantity}</span><button data-service="increase" data-id="${esc(item.productId)}" aria-label="${esc(item.product.name)} 수량 늘리기">+</button></div></article>`).join('')}</div><div class="cart-total"><span>상품 합계</span><strong>${money(total)}</strong></div><p class="service-form-hint">시연 배송비 0원 · 실제 배송 없음</p><button class="button primary" data-service="checkout">주문 확인 ${icon('arrow',16)}</button>`:empty('장바구니가 비어 있어요','필요한 촬영 도구를 담아보세요.','shop')}</aside></div><section class="service-panel"><div class="service-panel-title"><h3>주문 내역</h3><span class="service-count">${state.orders.length}건</span></div>${state.orders.length?`<div class="service-list">${state.orders.map(order=>`<article class="service-order"><div><span class="review-badge ${order.status==='cancelled'?'rejected':'approved'}">${order.status==='cancelled'?'취소됨':'주문 완료 · 시연'}</span><h4>${esc(order.items.map(item=>item.name || products.find(product=>product.id===item.productId)?.name || '촬영 도구').join(', '))}</h4><p>${date(order.createdAt)} · ${order.paymentMethod==='reward'?'적립 수익 사용':'카드 결제 시연'} · 실제 배송 없음</p></div><strong>${money(order.total)}</strong>${order.status!=='cancelled'?`<button class="button" data-service="cancel" data-id="${esc(order.id)}">주문 취소</button>`:''}</article>`).join('')}</div>`:empty('아직 주문한 도구가 없어요','주문과 취소 흐름을 확인할 수 있어요.','package')}</section>${statusLine}`;
  container.onclick=event=>{const button=event.target.closest('[data-service]');if(!button)return;const action=button.dataset.service,id=button.dataset.id;if(action==='checkout'){void openCheckout();return;}if(!['add','increase','decrease','cancel'].includes(action))return;void perform(container,async()=>{if(action==='cancel')return cancelOrder(id);return changeCartQuantity(id,action==='decrease'?-1:1);},async()=>{renderShop(container,await getServiceState());message(container,action==='cancel'?'시연 주문을 취소했어요. 사용한 적립금은 반환됐어요.':'장바구니를 업데이트했어요.');});};
}

async function openCheckout() {
  const element=dialog('주문 확인',`<p role="status">장바구니를 확인하고 있어요…</p>${statusLine}`);
  try {
    const state=await getServiceState();if(!element.open)return;const items=cartItems(state),total=items.reduce((sum,item)=>sum+item.product.price*item.quantity,0),key=crypto.randomUUID();
    if(!items.length){element.querySelector('.service-dialog-body').innerHTML=empty('장바구니가 비어 있어요','상품을 담은 뒤 다시 열어주세요.','shop');return;}
    element.querySelector('.service-dialog-body').innerHTML=`${note}<div class="checkout-items">${items.map(item=>`<p><span>${esc(item.product.name)} × ${item.quantity}</span><strong>${money(item.product.price*item.quantity)}</strong></p>`).join('')}<p class="checkout-total"><span>총 결제 금액 · 시연</span><strong>${money(total)}</strong></p></div><form id="checkout-form" class="service-form"><fieldset><legend>결제 방법</legend><label class="service-check"><input type="radio" name="paymentMethod" value="reward" ${state.wallet.available>=total?'checked':''} ${state.wallet.available<total?'disabled':''}><span>적립 수익으로 구매 <small>사용 가능 ${money(state.wallet.available)}</small></span></label><label class="service-check"><input type="radio" name="paymentMethod" value="demo-card" ${state.wallet.available<total?'checked':''}><span>카드 결제 시연 <small>카드번호 입력·실제 승인은 없습니다.</small></span></label></fieldset><div class="demo-delivery">${icon('package')}<div><strong>시연용 배송지</strong><p>실제 주소와 연락처를 받지 않아요. 상품은 배송되지 않아요.</p></div></div><label class="service-check"><input type="checkbox" required><span>실제 구매가 아닌 주문 흐름 시연임을 확인했어요.</span></label>${statusLine}<button class="button primary" type="submit">${money(total)} 시연 주문</button></form>`;
    const expectedItems=items.map(item=>({productId:item.productId,quantity:item.quantity,price:item.product.price}));
    const form=element.querySelector('form');form.onsubmit=event=>{event.preventDefault();const paymentMethod=new FormData(form).get('paymentMethod');void perform(element,()=>checkoutCart({paymentMethod,idempotencyKey:key,expectedItems}),order=>{element.querySelector('.service-dialog-body').innerHTML=`<div class="service-success">${icon('package',44)}<h3>시연 주문이 기록됐어요</h3><strong>${money(order.total)}</strong><p>주문 내역에서 확인하거나 취소할 수 있어요.<br>실제 결제와 배송은 진행되지 않았어요.</p><button class="button primary" data-finish>주문 내역 확인</button></div>`;element.querySelector('[data-finish]').onclick=()=>element.close();});};
  }catch(error){message(element,errorText(error),true);}
}

export async function openReviewDemo() {
  const element=dialog('운영자 시연',`<p role="status">심사와 출금 대기 항목을 불러오고 있어요…</p>${statusLine}`,true);
  async function render() {
    const state=await getServiceState();if(!element.open)return;
    const pending=state.submissions.filter(item=>['submitted','reviewing'].includes(item.status)),payouts=state.payouts.filter(item=>item.status==='pending');
    element.querySelector('.service-dialog-body').innerHTML=`${note}<p class="operator-explanation">참여자에게 보이는 결과를 확인하기 위한 별도 운영자 시연입니다. 실제 관리자 인증·원격 심사·은행 처리는 연결되어 있지 않아요.</p><h3 class="operator-heading">영상 심사 <span>${pending.length}건</span></h3>${pending.length?pending.map(item=>`<article class="operator-card" data-submission="${esc(item.id)}"><div class="service-panel-title"><div><h4>${esc(item.title)}</h4><p>${item.attempt}번째 제출 · 통과 시 ${money(item.reward)}</p></div>${badge(item.status)}</div><label>반려 사유<textarea name="reason" rows="2" maxlength="500" placeholder="예: 손이 화면 밖으로 나간 구간을 다시 확인해주세요."></textarea></label><div class="service-actions"><button class="button" data-op="preview" data-clip="${esc(item.clipId)}">영상 확인</button>${item.status==='submitted'?'<button class="button" data-op="start">심사 시작</button>':''}<button class="button danger" data-op="reject">반려 시연</button><button class="button primary" data-op="approve">통과·적립 시연</button></div></article>`).join(''):empty('대기 중인 심사가 없어요','참여자 화면에서 실제 영상 파일을 제출하면 여기에 보여요.','checkCircle')}<h3 class="operator-heading">출금 결과 시연 <span>${payouts.length}건</span></h3>${payouts.length?payouts.map(item=>`<article class="operator-card" data-payout="${esc(item.id)}"><div class="service-panel-title"><h4>${money(item.amount)}</h4><span class="review-badge submitted">처리 대기</span></div><p>${accountText(item.account || item.accountSnapshot)}</p><div class="service-actions"><button class="button danger" data-op="payout-fail">실패·반환 시연</button><button class="button primary" data-op="payout-complete">출금 완료 시연</button></div></article>`).join(''):empty('대기 중인 출금이 없어요','수익 화면에서 출금을 신청한 뒤 결과를 확인해보세요.','bank')}${statusLine}`;
  }
  element.onclick=event=>{const button=event.target.closest('[data-op]');if(!button)return;const action=button.dataset.op,submission=button.closest('[data-submission]'),payout=button.closest('[data-payout]');if(action==='preview'){element.close();void openClip(button.dataset.clip);return;}const reason=submission?.querySelector('textarea')?.value.trim();void perform(element,async()=>{if(action==='start')return startReview(submission.dataset.submission);if(action==='approve'||action==='reject')return reviewSubmission(submission.dataset.submission,{decision:action==='approve'?'approved':'rejected',reason});if(action==='payout-fail'||action==='payout-complete')return resolveWithdrawal(payout.dataset.payout,{outcome:action==='payout-fail'?'failed':'completed'});},async()=>{await render();message(element,'시연 결과를 반영했어요. 참여자 웹과 앱에도 같은 상태가 보여요.');});};
  try{await render();}catch(error){message(element,errorText(error),true);}
}
