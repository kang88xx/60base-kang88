import { db, notify } from './store.js';
import { missions, products, banks } from './data.js';

const fresh = () => ({id:'service',submissions:[],ledger:[],payouts:[],account:null,cart:[],orders:[]});
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const newest = items => [...items].reverse().sort((a,b) => b.createdAt.localeCompare(a.createdAt));
function wallet(state) {
  const sum = type => state.ledger.filter(row => row.type === type).reduce((total,row) => total + row.amount,0);
  return {
    available:state.ledger.reduce((total,row) => total + row.amount,0),
    totalEarned:sum('reward'),
    pendingWithdrawal:state.payouts.filter(row => row.status === 'pending').reduce((total,row) => total+row.amount,0),
    totalWithdrawn:state.payouts.filter(row => row.status === 'completed').reduce((total,row) => total+row.amount,0),
    totalSpent:Math.max(0,-(sum('purchase')+sum('refund'))),
    pendingReward:state.submissions.filter(row => ['submitted','reviewing'].includes(row.status)).reduce((total,row) => total+row.reward,0),
  };
}
function credit(state, operationKey, type, amount, description) {
  requireValue(Number.isSafeInteger(amount), '금액은 정수 원 단위여야 해요.');
  if (state.ledger.some(row => row.operationKey === operationKey)) return;
  state.ledger.push({id:uid(),operationKey,type,amount,description,createdAt:now()});
}
function key(value) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= 128,'요청 식별자가 필요해요. 다시 시도해주세요.');
  return value;
}
function transaction(operation, {readonly=false,clipId}={}) {
  return db().then(connection => new Promise((resolve,reject) => {
    // Every business mutation shares this scope, including clip edit/delete, so
    // cross-tab submissions and balance spending cannot race each other.
    const tx=connection.transaction(['settings','clips'],readonly?'readonly':'readwrite');
    let result, failure;
    tx.oncomplete=()=>{if(!readonly) notify();resolve(result);};
    tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('저장하지 못했어요. 저장 공간을 확인해주세요.'));
    const settings=tx.objectStore('settings');
    const request=settings.get('service');
    request.onsuccess=()=>{
      const state=request.result||fresh();
      const run=clip=>{try{result=operation(state,clip);if(!readonly)settings.put(state);}catch(error){failure=error;tx.abort();}};
      if(clipId!==undefined){const clip=tx.objectStore('clips').get(clipId);clip.onsuccess=()=>run(clip.result);}else run();
    };
  }));
}
export const getServiceState = () => transaction(state => ({...state,submissions:newest(state.submissions),ledger:newest(state.ledger),payouts:newest(state.payouts),orders:newest(state.orders),wallet:wallet(state)}),{readonly:true});
export async function submitClip(clipId) {
  requireValue(typeof clipId==='string' && clipId.length>0,'제출할 영상을 선택해주세요.');
  return transaction((state,clip)=>{
    requireValue(clip && !clip.example && clip.source!=='sample' && clip.blob instanceof Blob && clip.blob.size>0 && clip.blob.type.startsWith('video/'),'실제 영상 파일을 촬영하거나 올려주세요. 예시 기록은 제출할 수 없어요.');
    const previous=state.submissions.filter(row=>row.clipId===clipId);
    requireValue(!previous.some(row=>row.status!=='rejected'),'이미 심사 중이거나 통과한 영상이에요.');
    const mission=missions.find(row=>row.id===clip.missionId);
    requireValue(mission && Number.isSafeInteger(mission.reward) && mission.reward>0,'유효한 미션을 선택해주세요.');
    const submission={id:uid(),clipId,title:clip.title,missionId:mission.id,reward:mission.reward,status:'submitted',attempt:previous.length+1,createdAt:now(),reviewedAt:null,reason:''};
    state.submissions.push(submission);return submission;
  },{clipId});
}
export const startReview = submissionId => transaction(state=>{
  const row=state.submissions.find(row=>row.id===submissionId);
  requireValue(row,'심사 요청을 찾을 수 없어요.');
  requireValue(['submitted','reviewing'].includes(row.status),'이미 결정된 심사예요.');row.status='reviewing';return row;
});
export const reviewSubmission = (submissionId,{decision,reason}={}) => transaction(state=>{
  requireValue(['approved','rejected'].includes(decision),'통과 또는 반려를 선택해주세요.');
  const row=state.submissions.find(row=>row.id===submissionId);
  requireValue(row,'심사 요청을 찾을 수 없어요.');
  if(['approved','rejected'].includes(row.status)){requireValue(row.status===decision,'이미 다른 결과로 결정된 심사예요.');return row;}
  const text=typeof reason==='string'?reason.trim():'';
  requireValue(decision!=='rejected'||(text.length>0 && text.length<=1000),'반려 사유를 1~1,000자로 입력해주세요.');
  row.status=decision;row.reason=text.slice(0,1000);row.reviewedAt=now();
  if(decision==='approved')credit(state,`review:${row.id}`,'reward',row.reward,`${row.title} 심사 통과 시연 보상`);
  return row;
});
export const savePayoutAccount = ({bankCode,holder,last4}={}) => transaction(state=>{
  const bank=banks.find(row=>row.code===bankCode);
  requireValue(bank,'은행을 선택해주세요.');
  requireValue(typeof holder==='string' && holder.trim().length>0 && holder.trim().length<=24,'예금주 표시 이름을 1~24자로 입력해주세요.');
  requireValue(typeof last4==='string' && /^\d{4}$/.test(last4),'실제 계좌번호 대신 뒤 4자리만 입력해주세요.');
  state.account={bankCode,bankName:bank.name,holder:holder.trim(),last4};return state.account;
});
export const deletePayoutAccount = () => transaction(state=>{
  requireValue(!state.payouts.some(row=>row.status==='pending'),'처리 중인 출금 시연이 있어요. 처리 후 계좌를 삭제해주세요.');state.account=null;return null;
});
export const requestWithdrawal = ({amount,idempotencyKey,expectedAccount}={}) => transaction(state=>{
  key(idempotencyKey);
  const existing=state.payouts.find(row=>row.idempotencyKey===idempotencyKey);if(existing)return existing;
  requireValue(state.account,'먼저 시연용 계좌 표시 정보를 등록해주세요.');
  if(expectedAccount!==undefined) {
    requireValue(expectedAccount && ['bankCode','holder','last4'].every(field=>expectedAccount[field]===state.account[field]),'출금 계좌가 변경되었어요. 계좌 정보를 다시 확인해주세요.');
  }
  requireValue(Number.isSafeInteger(amount)&&amount>=1000,'출금 금액은 1,000원 이상의 정수로 입력해주세요.');
  requireValue(amount<=wallet(state).available,'출금 가능한 시연 잔액이 부족해요.');
  const payout={id:uid(),idempotencyKey,amount,account:{...state.account},status:'pending',createdAt:now(),resolvedAt:null};
  credit(state,`withdrawal:${payout.id}`,'withdrawal',-amount,'출금 신청 시연');state.payouts.push(payout);return payout;
});
export const resolveWithdrawal = (id,{outcome}={}) => transaction(state=>{
  requireValue(['completed','failed'].includes(outcome),'출금 시연 결과를 선택해주세요.');
  const row=state.payouts.find(row=>row.id===id);requireValue(row,'출금 요청을 찾을 수 없어요.');
  if(row.status!=='pending'){requireValue(row.status===outcome,'이미 다른 결과로 처리된 출금이에요.');return row;}
  row.status=outcome;row.resolvedAt=now();
  if(outcome==='failed')credit(state,`withdrawal-return:${row.id}`,'withdrawal-return',row.amount,'실패한 출금 시연 잔액 반환');return row;
});
function updateCart(state, productId, quantity) {
  const product=products.find(row=>row.id===productId);requireValue(product,'상품을 찾을 수 없어요.');
  requireValue(Number.isInteger(quantity)&&quantity>=0&&quantity<=Math.min(product.stock,10),'상품 수량은 재고 범위 안에서 0~10개로 선택해주세요.');
  state.cart=state.cart.filter(row=>row.productId!==productId);if(quantity)state.cart.push({productId,quantity});return state.cart;
}
export const setCartQuantity = (productId,quantity) => transaction(state=>updateCart(state,productId,quantity));
export const changeCartQuantity = (productId,delta) => transaction(state=>{
  requireValue(delta===1||delta===-1,'수량은 한 개씩 변경해주세요.');
  const quantity=state.cart.find(row=>row.productId===productId)?.quantity||0;
  return updateCart(state,productId,quantity+delta);
});
export const checkoutCart = ({paymentMethod,idempotencyKey,expectedItems}={}) => transaction(state=>{
  key(idempotencyKey);
  const existing=state.orders.find(row=>row.idempotencyKey===idempotencyKey);if(existing)return existing;
  requireValue(['reward','demo-card'].includes(paymentMethod),'시연 결제 방법을 선택해주세요.');
  requireValue(state.cart.length>0,'장바구니에 상품을 담아주세요.');
  const items=state.cart.map(row=>{
    const product=products.find(product=>product.id===row.productId);
    requireValue(product && Number.isInteger(row.quantity) && row.quantity>0 && row.quantity<=Math.min(product.stock,10),'상품 재고와 수량을 다시 확인해주세요.');
    return {productId:product.id,name:product.name,price:product.price,quantity:row.quantity};
  });
  if(expectedItems!==undefined) {
    const matches=Array.isArray(expectedItems) && expectedItems.length===items.length &&
      expectedItems.every(row=>row && typeof row.productId==='string') &&
      new Set(expectedItems.map(row=>row.productId)).size===items.length &&
      items.every(item=>expectedItems.some(row=>row.productId===item.productId && row.quantity===item.quantity && row.price===item.price));
    requireValue(matches,'장바구니가 변경되었어요. 상품과 금액을 다시 확인해주세요.');
  }
  const total=items.reduce((sum,row)=>sum+row.price*row.quantity,0);
  requireValue(Number.isSafeInteger(total)&&total>0,'주문 금액을 확인해주세요.');
  if(paymentMethod==='reward')requireValue(total<=wallet(state).available,'주문에 사용할 시연 잔액이 부족해요.');
  const order={id:uid(),idempotencyKey,items,total,paymentMethod,status:'ordered',createdAt:now(),cancelledAt:null,shippingLabel:'시연 배송지 · 실제 배송 없음'};
  if(paymentMethod==='reward')credit(state,`purchase:${order.id}`,'purchase',-total,'촬영 용품 시연 주문');
  state.orders.push(order);state.cart=[];return order;
});
export const cancelOrder = orderId => transaction(state=>{
  const row=state.orders.find(row=>row.id===orderId);requireValue(row,'주문을 찾을 수 없어요.');
  if(row.status==='cancelled')return row;
  row.status='cancelled';row.cancelledAt=now();
  if(row.paymentMethod==='reward')credit(state,`refund:${row.id}`,'refund',row.total,'시연 주문 취소 잔액 반환');return row;
});
