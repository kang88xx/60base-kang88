// Google membership and the operations server use separate authenticated sessions.
// Browser profiles and demo wallet values are never authentication evidence.
function accountBanner() {
  const notice=capturePlanNotice()||(!favoritesPersistent?favoritesMemoryNotice:'');
  return `<p id="studio-account-status" class="${notice?'favorites-storage-notice':'sr-only'}" role="status">${esc(notice)}</p>`;
}

function openAccountEntry() { void showAccountEntry(); }

import { missions, getMission, formatDuration, formatBytes, statusLabel, formatMoney, reviewStatusLabel } from '../shared/data.js';
import { getClips, subscribe, getProfile, saveProfile, addExamples } from '../shared/store.js';
import { openGuide } from '../shared/capture.js';
import { openStudioCamera, closeStudioCamera } from './camera.js';
import { openLocalImport, openLocalClip } from './local-records.js';
import { icon, escapeHTML as esc } from '../shared/ui.js';
import {bindSupportFaq} from './support-faq.js';
let releaseGuideFaq=()=>{},guideFaqOpen=[],cameraContext=null;
function cameraIsCurrent(){return cameraContext&&getStudioAccess()==='allowed'&&cameraContext.account===studioAccountKey()&&cameraContext.epoch===sessionEpoch;}
function launchStudioCamera(id){
  const activity=captureById(id)||selectedCapture()||{id:'camera',title:'촬영 영상',category:'촬영'};
  cameraContext={account:studioAccountKey(),epoch:sessionEpoch};
  openStudioCamera({activity,isCurrent:cameraIsCurrent,onSaved:()=>void refresh(),onSubmit:session.online&&session.user?clip=>submitLocalRecording(clip.id):undefined});
}

import { getServiceState } from '../shared/service-store.js';
import { renderWallet, renderShop, renderReviews, openAccount, openWithdraw, openReviewDemo } from '../shared/service-ui.js';
import {mountOnline,enhanceOnlineShell,showAccountEntry,submitLocalRecording} from './online.js';
import {points,session,sessionEpoch} from './online-api.js';
import {getStudioAccess,requiresStudioAccount,subscribeStudioAccess,studioAccountKey} from './access.js';

const titles={home:'홈',missions:'촬영 활동',library:'보관한 영상',reviews:'제출·심사',wallet:'포인트',shop:'상점·주문',support:'문의·도움',guide:'촬영 교육',profile:'계정 및 설정'};
const state={route:'home',clips:[],service:null,profile:{name:'참여자',goal:3},loading:true,error:'',category:'전체',missionQuery:'',missionDuration:'all',missionLevel:'all',captureQuery:'',captureCategory:'전체',captureExamplesOnly:false,captureSavedOnly:false,query:'',status:'all',sort:'newest',profileDraft:null,profileMessage:''};
const favoriteKey='momjit-studio-favorites-v1';
let favorites=[],favoritesPersistent=true;
const favoritesMemoryNotice='저장된 즐겨찾기를 읽거나 저장할 수 없어 현재 화면에서만 유지돼요. 기존 저장값은 변경하지 않아요.';
try{const saved=JSON.parse(localStorage.getItem(favoriteKey)||'[]');if(!Array.isArray(saved)||saved.some(id=>typeof id!=='string'))throw new Error('Invalid favorites');favorites=saved.filter(id=>missions.some(m=>m.id===id));}catch{favoritesPersistent=false;}
let favoritesOnly=false;
const photoKey='momjit-studio-photo-v1';
let profilePhoto='',photoReadError=false,reviewDialog=null,reviewObserver=null;
try{const value=localStorage.getItem(photoKey)||'';if(value&&!validPhoto(value))throw new Error('Invalid photo');profilePhoto=value;}catch{photoReadError=true;}
const main=document.querySelector('#workspace');
const icons=()=>document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon,20);});
const date=value=>new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit'}).format(new Date(value));
const collectionExamples=[
  {id:'dishwashing',label:'설거지',title:'주방 설거지 예시',src:'../assets/videos/collection/dishwashing.mp4',poster:'../assets/videos/collection/dishwashing.jpg',note:'손, 싱크대, 식기가 한 화면에 들어오는지 확인하세요.'},
  {id:'folding-clothes',label:'빨래 개기',title:'의류 정리 예시',src:'../assets/videos/collection/folding-clothes.mp4',poster:'../assets/videos/collection/folding-clothes.jpg',note:'옷 전체와 접는 손의 움직임이 잘리지 않게 촬영합니다.'},
  {id:'cutting-vegetables',label:'채소 손질',title:'채소 손질 예시',src:'../assets/videos/collection/cutting-vegetables.mp4',poster:'../assets/videos/collection/cutting-vegetables.jpg',note:'칼을 쓰는 장면은 천천히, 안전을 우선해 기록합니다.'},
  {id:'vacuuming',label:'바닥 청소',title:'거실 바닥 청소 예시',src:'../assets/videos/collection/vacuuming.mp4',poster:'../assets/videos/collection/vacuuming.jpg',note:'청소기 헤드와 바닥의 이동 경로가 함께 보이도록 촬영합니다.'},
  {id:'folding-towels',label:'수건 접기',title:'수건 접기 예시',src:'../assets/videos/collection/folding-towels.mp4',poster:'../assets/videos/collection/folding-towels.jpg',note:'수건 전체와 접고 정리하는 손의 움직임이 함께 보이도록 촬영합니다.'},
  {id:'dishwashing-2',label:'식기 헹구기',title:'식기 헹구기 예시',src:'../assets/videos/collection/dishwashing-2.mp4',poster:'../assets/videos/collection/dishwashing-2.jpg',note:'식기와 양손, 흐르는 물이 화면에 함께 들어오는지 확인하세요.'},
];
const collectionActivities=['채소 씻기·손질·썰기','설거지','식기 정리','간단한 요리','빨래하기·널기·개기','옷 정리','식물 물주기','침대 시트 정리','식탁 차리기·치우기','자동차 내부 청소'];
const captureTerms=['본인 자택','휴대폰·노트북 카메라','가로 화면','약 5분','검수 통과 시 1건 3,000P','여러 건 참여 가능'];
const captureTermRows=[['장소','한국 내 본인 자택'],['촬영 방식','휴대폰·노트북 카메라'],['화면 방향','가로 화면'],['분량','약 5분'],['보상 조건','검수 통과 시 1건 3,000P'],['참여 횟수','여러 건 가능']];
const captureCategories=['전체','주방','세탁·의류','정원·베란다','침실','다이닝','기타'];
const captureActivities=[
  {id:'dishwashing',category:'주방',title:'설거지',description:'싱크대에서 식기를 씻고 헹구는 흐름을 자연스럽게 기록합니다.',actions:['식기를 물에 적시기','세제와 수세미로 닦기','헹군 뒤 건조대에 놓기'],tips:['양손과 싱크대 안쪽이 함께 보이도록 고개 각도를 맞춥니다.','상표나 개인 문서가 보이면 촬영 전에 치웁니다.'],exampleId:'dishwashing'},
  {id:'cutting-vegetables',category:'주방',title:'채소 씻기·손질·썰기',description:'채소를 씻고 손질한 뒤 안전하게 써는 과정을 담습니다.',actions:['채소 씻기','껍질 또는 꼭지 손질','도마 위에서 자르기'],tips:['칼을 사용하는 장면은 속도를 올리지 말고 평소보다 차분하게 진행합니다.','손, 칼, 도마가 화면 밖으로 나가지 않게 확인합니다.'],exampleId:'cutting-vegetables'},
  {id:'folding-clothes',category:'세탁·의류',title:'빨래 개기',description:'마른 옷을 펼치고 접어 정리하는 손동작을 안정적으로 기록합니다.',actions:['옷 펼치기','소매와 몸판 접기','접은 옷을 쌓거나 넣기'],tips:['옷 전체와 접는 손이 동시에 보이도록 상체 각도를 조정합니다.','개인 정보가 적힌 라벨이나 문구는 보이지 않게 합니다.'],exampleId:'folding-clothes'},
  {id:'simple-cooking',category:'주방',title:'간단한 요리',description:'재료 준비부터 조리 도구 사용까지 한 가지 간단한 요리 흐름을 촬영합니다.',actions:['재료 놓기','팬이나 냄비 사용','그릇에 옮겨 담기'],tips:['뜨거운 조리도구를 다룰 때는 안전을 먼저 확인합니다.','불필요한 대화나 연출 없이 평소 순서를 유지합니다.']},
  {id:'plants',category:'정원·베란다',title:'식물 물주기',description:'화분 위치를 확인하고 물을 주거나 잎을 정리하는 과정을 담습니다.',actions:['화분 앞에 서기','물뿌리개 또는 컵으로 물 주기','주변 물기 정리'],tips:['베란다 밖 주소나 이웃 공간이 화면에 들어오지 않게 합니다.','흙, 화분, 손 움직임이 함께 보이면 좋습니다.']},
  {id:'bedroom',category:'침실',title:'침대 정돈',description:'시트, 이불, 베개를 정리하며 침대를 평소처럼 정돈합니다.',actions:['시트 또는 이불 펴기','침대 모서리 정리','베개와 쿠션 놓기'],tips:['얼굴 사진, 주소 라벨, 개인 문서는 촬영 전에 치웁니다.','침대 전체와 손의 움직임이 번갈아 보이도록 천천히 움직입니다.']},
  {id:'dining',category:'다이닝',title:'식탁 차리기·치우기',description:'식탁을 차리거나 식사 후 식기와 테이블을 정리하는 흐름을 촬영합니다.',actions:['식기 놓기','사용한 그릇 치우기','테이블 닦기'],tips:['식탁 위 물건의 위치 변화가 보이도록 너무 가까이 붙지 않습니다.','가족 얼굴이나 사적인 대화가 들어가지 않게 합니다.']},
  {id:'car-interior',category:'기타',title:'자동차 내부 청소',description:'차 안의 먼지를 닦고 물건을 정리하는 일상 청소 장면을 기록합니다.',actions:['대시보드나 좌석 닦기','개인 물건 정리','쓰레기 분리하기'],tips:['차량번호, 주소, 출입증이 보이지 않게 합니다.','운전 중 촬영하지 않고 정차 상태에서만 진행합니다.']},
];
const capturePlanKey='momjit-studio-capture-plan-v1',capturePlanVersion=1;
let capturePlanPersistent=true,capturePlanError='',capturePlan=readCapturePlan();
const trainingKey='momjit-studio-training-v1',trainingVersion=1;
const trainingAnswers={q1:'landscape',q2:'privacy',q3:'natural'};
const trainingAnswerOptions={q1:['landscape','portrait'],q2:['tools','privacy'],q3:['natural','acting']};
let trainingPersistent=true,training=readTraining();
function defaultTraining(){return {version:trainingVersion,example:'dishwashing',answers:{},completed:false,preflight:{}};}
function readTraining(){
  try{
    const parsed=JSON.parse(localStorage.getItem(trainingKey)||'null');
    if(!parsed||parsed.version!==trainingVersion||!collectionExamples.some(item=>item.id===parsed.example))return defaultTraining();
    const answers=Object.fromEntries(Object.entries(trainingAnswerOptions).filter(([key,values])=>values.includes(parsed.answers?.[key])).map(([key])=>[key,parsed.answers[key]]));
    const preflight=Object.fromEntries(['headgear','landscape','fiveMinutes','privacy'].filter(key=>parsed.preflight?.[key]===true).map(key=>[key,true]));
    return {version:trainingVersion,example:parsed.example,answers,completed:parsed.completed===true,preflight};
  }catch{trainingPersistent=false;return defaultTraining();}
}
function writeTraining(next){
  training={...training,...next};
  if(!trainingPersistent)return false;
  try{localStorage.setItem(trainingKey,JSON.stringify(training));return true;}catch{trainingPersistent=false;return false;}
}
function activeExample(){return collectionExamples.find(item=>item.id===training.example)||collectionExamples[0];}
function trainingDone(){return Object.entries(trainingAnswers).every(([key,value])=>training.answers[key]===value);}
function captureById(id){return captureActivities.find(item=>item.id===id);}
function exampleIdForCapture(id){return captureExampleFor(captureById(id) || {})?.id || training.example;}
function defaultCapturePlan(){return {version:capturePlanVersion,saved:[],selected:''};}
function readCapturePlan(){
  try{
    const raw=localStorage.getItem(capturePlanKey);if(!raw)return defaultCapturePlan();
    const parsed=JSON.parse(raw),known=new Set(captureActivities.map(item=>item.id));
    if(!parsed||parsed.version!==capturePlanVersion||!Array.isArray(parsed.saved)||parsed.saved.some(id=>typeof id!=='string'||!known.has(id))||typeof parsed.selected!=='string'||(parsed.selected!==''&&!known.has(parsed.selected)))throw new Error('Invalid capture plan');
    return {version:capturePlanVersion,saved:[...new Set(parsed.saved)],selected:parsed.selected||''};
  }catch{capturePlanPersistent=false;capturePlanError='활동 저장값을 읽지 못해 현재 화면에서만 유지돼요. 기존 저장값은 변경하지 않아요.';return defaultCapturePlan();}
}
function writeCapturePlan(next){
  const known=new Set(captureActivities.map(item=>item.id));
  capturePlan={version:capturePlanVersion,saved:[...new Set((next.saved??capturePlan.saved).filter(id=>known.has(id)))],selected:known.has(next.selected??capturePlan.selected)?(next.selected??capturePlan.selected):''};
  if(!capturePlanPersistent)return false;
  try{localStorage.setItem(capturePlanKey,JSON.stringify(capturePlan));return true;}
  catch{capturePlanPersistent=false;capturePlanError='활동 저장소에 접근할 수 없어 현재 화면에서만 유지돼요. 기존 저장값은 변경하지 않아요.';return false;}
}
function selectCapture(id,{resetPreflight=false,syncExample=false}={}){
  if(!captureById(id))return false;
  writeCapturePlan({selected:id});
  if(syncExample){const example=exampleIdForCapture(id);if(example)writeTraining({example,preflight:resetPreflight?{}:training.preflight});}
  else if(resetPreflight)writeTraining({preflight:{}});
  return true;
}
function capturePlanNotice(){return capturePlanError||(!capturePlanPersistent?'활동 선택과 저장은 현재 화면에서만 유지돼요.':'');}
function selectedCapture(){return captureById(capturePlan.selected);}
function preflightCount(){return ['headgear','landscape','fiveMinutes','privacy'].filter(key=>training.preflight[key]).length;}
function trainingComplete(){return training.completed&&trainingDone();}
function captureExampleFor(activity){return collectionExamples.find(item=>item.id===activity.exampleId);}
function captureProgressText(){
  const activity=selectedCapture(),done=trainingComplete(),ready=preflightCount();
  if(!activity)return '촬영할 활동을 선택해 주세요.';
  if(!done)return `${activity.title} 선택됨 · 촬영 교육을 먼저 확인하세요.`;
  if(ready<4)return `${activity.title} 선택됨 · 제출 전 확인 ${ready}/4`;
  return `${activity.title} 선택됨 · 촬영 전 확인이 끝났습니다.`;
}
function goToGuide(section='training'){
  const focus=()=>requestAnimationFrame(()=>{const target=document.querySelector(`[data-guide-section="${section}"]`)||document.querySelector(`#${section}`)||document.querySelector('.capture-guide-context');if(target){target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});(target.querySelector('button,input,video')||target).focus?.({preventScroll:true});}});
  if(state.route==='guide')focus();else{location.hash='guide';setTimeout(focus,0);}
}
function captureFiltered(){
  const query=state.captureQuery.trim().toLowerCase();
  return captureActivities.filter(item=>(state.captureCategory==='전체'||item.category===state.captureCategory)&&(!state.captureExamplesOnly||item.exampleId)&&(!state.captureSavedOnly||capturePlan.saved.includes(item.id))&&`${item.title} ${item.category} ${item.description} ${item.actions.join(' ')}`.toLowerCase().includes(query));
}

function captureTaskCard(activity){
  const example=captureExampleFor(activity),saved=capturePlan.saved.includes(activity.id),selected=capturePlan.selected===activity.id;
  return `<article class="capture-task ${selected?'is-selected':''}" data-id="${activity.id}"><div class="capture-task-body"><div class="capture-task-meta"><span>${esc(activity.category)}</span>${selected?'<span class="capture-selected-label">촬영 준비 중</span>':''}</div><h3>${esc(activity.title)}</h3><p>${esc(activity.description)}</p><div class="capture-task-actions"><button class="icon-button capture-save" data-action="capture-save" data-id="${activity.id}" aria-label="${esc(activity.title)} 저장" aria-pressed="${saved}">${saved?'★':'☆'}</button><button class="button" data-action="capture-detail" data-id="${activity.id}">상세 보기</button><button class="button" data-action="capture-prepare" data-id="${activity.id}">촬영 준비</button><button class="button primary" data-action="camera" data-id="${activity.id}">바로 촬영 ${icon('camera',15)}</button></div></div>${example?`<button class="capture-task-thumb" data-action="capture-detail" data-id="${activity.id}" aria-label="${esc(activity.title)} 예시와 상세 보기"><img src="${example.poster}" alt=""><span>${icon('play',18)}</span></button>`:''}</article>`;
}
function captureCatalogMarkup(){
  const count=captureFiltered().length;
  return `<section class="capture-catalog" aria-labelledby="capture-catalog-title"><h2 id="capture-catalog-title" class="sr-only">촬영 활동 목록</h2><div class="capture-toolbar"><label class="search-field">${icon('search',18)}<input id="capture-search" type="search" placeholder="활동명, 공간, 동작 검색" value="${esc(state.captureQuery)}" aria-label="촬영 활동 검색"></label><div class="capture-filter-row" aria-label="촬영 활동 분류">${captureCategories.map(category=>`<button class="filter-chip ${state.captureCategory===category?'active':''}" data-action="capture-category" data-capture-category="${category}" aria-pressed="${state.captureCategory===category}">${category}<span class="capture-category-count">${category==='전체'?captureActivities.length:captureActivities.filter(activity=>activity.category===category).length}</span></button>`).join('')}</div><div class="capture-toggle-row"><button class="filter-chip ${state.captureExamplesOnly?'active':''}" id="capture-example-filter" data-action="capture-example-filter" aria-pressed="${state.captureExamplesOnly}">예시 영상 있음</button><button class="filter-chip ${state.captureSavedOnly?'active':''}" id="capture-saved-filter" data-action="capture-saved-filter" aria-pressed="${state.captureSavedOnly}">저장한 활동</button><button class="button" id="capture-reset" data-action="reset-capture-filter">초기화</button></div></div><p id="capture-count" class="mission-results-count" role="status" aria-live="polite" aria-atomic="true">전체 ${captureActivities.length}개 중 ${count}개 활동</p><div id="capture-results">${captureResultMarkup()}</div></section>`;
}
function captureResultMarkup(){
  const filtered=captureFiltered();
  return filtered.length?`<div class="capture-grid">${filtered.map(captureTaskCard).join('')}</div>`:`<div class="empty-state">${icon('search',32)}<h3>조건에 맞는 활동이 없어요</h3><p>검색어나 필터를 넓혀 다시 확인해보세요.</p><button class="button" data-action="reset-capture-filter">활동 검색 초기화</button></div>`;
}
function renderCaptureCatalog(){
  const count=document.querySelector('#capture-count'),results=document.querySelector('#capture-results');if(!count||!results)return;
  const filtered=captureFiltered();
  count.textContent=`전체 ${captureActivities.length}개 중 ${filtered.length}개 활동`;
  results.innerHTML=filtered.length?`<div class="capture-grid">${filtered.map(captureTaskCard).join('')}</div>`:`<div class="empty-state">${icon('search',32)}<h3>조건에 맞는 활동이 없어요</h3><p>검색어나 필터를 넓혀 다시 확인해보세요.</p><button class="button" data-action="reset-capture-filter">활동 검색 초기화</button></div>`;
  document.querySelectorAll('[data-action="capture-category"]').forEach(button=>{const active=button.dataset.captureCategory===state.captureCategory;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  document.querySelector('#capture-example-filter')?.setAttribute('aria-pressed',String(state.captureExamplesOnly));
  document.querySelector('#capture-example-filter')?.classList.toggle('active',state.captureExamplesOnly);
  document.querySelector('#capture-saved-filter')?.setAttribute('aria-pressed',String(state.captureSavedOnly));
  document.querySelector('#capture-saved-filter')?.classList.toggle('active',state.captureSavedOnly);
  const notice=document.querySelector('#capture-storage-status');if(notice){const text=capturePlanNotice();notice.textContent=text;notice.className=text?'favorites-storage-notice':'sr-only';}
}
function openCaptureDetail(id){
  const activity=captureById(id);if(!activity||document.querySelector('#capture-detail-dialog'))return;
  document.querySelectorAll('video').forEach(video=>video.pause());
  const example=captureExampleFor(activity),saved=capturePlan.saved.includes(activity.id),selected=capturePlan.selected===activity.id;
  const dialog=studioDialog('capture-detail-dialog',activity.title,`<div class="capture-detail-layout"><main><p class="detail-intro">${esc(activity.description)}</p>${example?`<div class="example-frame capture-detail-media"><video controls muted playsinline preload="metadata" poster="${example.poster}" src="${example.src}" aria-label="${esc(activity.title)} 촬영 예시"></video><div><h3>${esc(example.title)}</h3><p>${esc(example.note)}</p><small>예시 20초 · 참여 영상 약 5분</small><p class="example-video-status" role="status" aria-live="polite"></p></div></div>`:'<div class="capture-no-video">이 활동은 아직 공개 예시 영상이 없어요. 공통 기준을 보고 준비하세요.</div>'}<section><h3>촬영할 내용</h3><ul class="capture-action-list">${activity.actions.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></section><section><h3>활동별 촬영 팁</h3><ul class="capture-action-list">${activity.tips.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></section></main><aside><div class="capture-detail-summary"><span class="account-kicker">공통 조건</span><dl>${captureTermRows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></div><div class="capture-detail-status"><strong>준비 상태</strong><p>${esc(selected?captureProgressText():'이 활동을 다음 촬영으로 선택할 수 있어요.')}</p><p id="capture-detail-status" role="status" aria-live="polite"></p></div><div class="capture-detail-actions"><button class="button" data-action="capture-save" data-id="${activity.id}" aria-pressed="${saved}">${saved?'저장 해제':'활동 저장'}</button><button class="button primary" data-action="camera" data-id="${activity.id}">이 활동 바로 촬영</button><button class="button" data-action="capture-prepare" data-id="${activity.id}">촬영 준비 확인</button><button class="button" data-action="guide-section" data-guide-target="examples">예시·교육 보기</button></div></aside></div>`);
  dialog.addEventListener('close',()=>dialog.querySelectorAll('video').forEach(video=>video.pause()),{once:true});
}
function collectionProgramCard(inGuide=false){return `<section class="collection-program panel" aria-labelledby="collection-program-title"><div class="collection-program-copy"><span class="account-kicker">한국 집안일 영상 수집</span><h2 id="collection-program-title">집에서 평소처럼 하는 집안일을 약 5분 기록해요.</h2><p>휴대폰이나 노트북 카메라를 고정하고 가로 화면으로 촬영합니다. 검수 기준 통과 시 영상 1건당 3,000P를 적립하며, 여러 건 참여할 수 있어요.</p><div class="collection-facts"><span>장소: 본인 자택</span><span>분량: 약 5분</span><span>검수 통과 시 1건 3,000P</span></div><div class="collection-actions">${inGuide?`<button class="button primary" data-action="collection-apply">참여 방법 보기</button><button class="button" data-action="scroll-examples">예시 영상 보기</button>`:`<a class="button primary" href="#guide">촬영 교육 보기 ${icon('arrow',16)}</a><button class="button" data-action="collection-apply">참여 방법 보기</button>`}</div></div><div class="collection-program-aside"><strong>촬영 가능한 활동</strong><p>${collectionActivities.slice(0,6).join(' · ')}</p><small>촬영 교육을 확인하고, 원하는 활동에서 바로 촬영하세요.</small></div></section>`;}

function collectionExamplePlayer(compact=false){
  const selected=activeExample(),titleId=compact?'home-example-title':'guide-example-title';
  return `<section class="collection-examples ${compact?'compact home-example-module':''}" aria-labelledby="${titleId}"><div class="collection-example-head"><h2 id="${titleId}">촬영 예시</h2><span>20초 미리보기</span></div><div class="example-frame"><video controls muted playsinline preload="metadata" poster="${selected.poster}" src="${selected.src}" aria-label="60BASE 촬영 예시: ${esc(selected.label)} · 20초"></video><div class="example-frame-copy"><h3>${esc(selected.title)}</h3><p>${esc(selected.note)}</p><p class="example-video-status" role="status" aria-live="polite"></p></div></div><div class="example-switcher" role="group" aria-label="촬영 예시 선택">${collectionExamples.map(item=>`<button type="button" aria-pressed="${item.id===selected.id}" data-action="collection-example" data-example="${item.id}">${esc(item.label)}</button>`).join('')}</div></section>`;
}
function openCollectionInstructions(submission=false){
  if(document.querySelector('#collection-instructions'))return;
  const subject=encodeURIComponent('60BASE 촬영 참여 문의'),body=encodeURIComponent(`참여 희망\n관심 있는 활동: ${selectedCapture()?.title||''}\n촬영 장비 보유 여부: `);
  const dialog=studioDialog('collection-instructions',submission?'제출 방법 안내':'참여 방법 안내',`<p class="detail-intro">${submission?'촬영한 영상을 이 브라우저에 저장한 뒤, 심사 제출하기를 눌러 동의 내용을 확인하고 제출하세요.':'로그인 후 촬영 활동을 고르고 바로 촬영하세요. 휴대폰 카메라나 노트북 웹캠을 사용할 수 있습니다.'}</p><div class="collection-actions"><button class="button primary" data-action="camera">바로 촬영</button><a class="button" href="#reviews">제출·심사 내역</a></div><section class="participation-contact"><h3>촬영이나 참여 방법이 궁금한가요?</h3><a class="button primary" href="mailto:60base.ai@gmail.com?subject=${subject}&body=${body}">참여 문의 메일 작성 ${icon('arrowUp',16)}</a><a class="participation-email" href="mailto:60base.ai@gmail.com">60base.ai@gmail.com</a><p>관심 있는 활동이나 도움이 필요한 내용을 알려주세요. 저장만 한 영상은 자동으로 제출되지 않습니다.</p></section><details class="participation-channel"><summary>모집 공고를 보고 오셨나요?</summary><p>모집 공고를 본 채널에 아래 문구를 보내셔도 됩니다.</p><label class="collection-message-label" for="collection-message">참여 메시지<textarea id="collection-message" readonly rows="2">참여 희망</textarea></label><button class="button" data-copy-participation>참여 메시지 복사</button><p data-participation-status role="status" aria-live="polite"></p></details>`);
  dialog.querySelector('[data-copy-participation]').addEventListener('click',async()=>{
    const status=dialog.querySelector('[data-participation-status]');
    try{await navigator.clipboard.writeText('참여 희망');status.textContent='참여 메시지를 복사했어요. 모집 공고를 본 채널에 붙여넣어 보내주세요.';}
    catch{const field=dialog.querySelector('#collection-message');field.focus();field.select();status.textContent='자동으로 복사하지 못했어요. 선택된 문구를 직접 복사해주세요.';}
  });
}
function artwork(mission){
  const illustrations={
    table:'<ellipse cx="180" cy="91" rx="76" ry="17" fill="#bdce8c"/><ellipse cx="154" cy="65" rx="53" ry="38" fill="#fffef4"/><ellipse cx="154" cy="65" rx="33" ry="23" fill="none" stroke="#d2ddb7" stroke-width="2"/><rect x="224" y="28" width="29" height="47" rx="5" fill="#63794c"/><path d="M253 37c23-5 21 25 0 21" stroke="#63794c" stroke-width="6" fill="none"/><path d="M76 29v63m-9-63v18q9 13 18 0V29m-9 28v35" stroke="#5b7250" stroke-width="4" stroke-linecap="round"/>',
    laundry:'<rect x="91" y="70" width="145" height="25" rx="10" fill="#5a79c7"/><rect x="102" y="48" width="129" height="29" rx="9" fill="#99b0eb"/><rect x="113" y="25" width="109" height="29" rx="9" fill="#e5edff"/><path d="M117 40h94M110 65h112M100 86h126" stroke="#fff" opacity=".45" stroke-width="2"/>',
    shelf:'<path d="M57 91h229" stroke="#a77057" stroke-width="8"/><rect x="85" y="27" width="24" height="60" rx="3" fill="#d39370"/><rect x="112" y="18" width="29" height="69" rx="3" fill="#f8f3e9"/><rect x="145" y="37" width="18" height="50" rx="3" fill="#657c65"/><path d="m173 28 22-5 15 62-22 5z" fill="#e4b778"/><path d="M232 60h35v25h-35z" fill="#3d5549"/><path d="M248 60V31m0 13q-26-21-20-2 7 13 20 2m0-6q26-21 20-2-7 13-20 2" stroke="#3d5549" fill="none" stroke-width="3"/>',
    coffee:'<ellipse cx="169" cy="96" rx="60" ry="12" fill="#bfb7d4"/><path d="M119 36h89l-10 55h-69z" fill="#f9f6ff"/><path d="M208 45q40-5 28 24-12 12-33 6" stroke="#f9f6ff" stroke-width="10" fill="none"/><ellipse cx="163" cy="36" rx="44" ry="9" fill="#9c7d61"/><path d="M159 10q-8 10 0 17M180 6q-8 10 0 17" fill="none" stroke="#c0b4d6" stroke-width="3"/>',
    bag:'<rect x="109" y="35" width="110" height="68" rx="18" fill="#b49d62"/><path d="M141 37v-9a23 23 0 0 1 46 0v9" fill="none" stroke="#6a6844" stroke-width="6"/><rect x="125" y="60" width="78" height="27" rx="7" fill="#e5d9b3"/><path d="M143 73h42" stroke="#8f8354" stroke-width="2"/>',
    recycle:'<path d="m95 41 8 59h51l8-59" fill="#83b5a3"/><path d="m182 41 8 59h51l8-59" fill="#b8cfae"/><path d="M90 36h76m11 0h76" stroke="#477568" stroke-width="6" stroke-linecap="round"/><path d="m115 71 10-16 10 16h-20m82 0 10-16 10 16h-20" stroke="#f2fff5" fill="none" stroke-width="3"/>',
  };
  return `<svg viewBox="0 0 340 125" aria-hidden="true"><circle cx="295" cy="14" r="58" fill="currentColor" opacity=".04"/>${illustrations[mission.id]||illustrations.table}<path d="M24 21h9m-4-4v8M307 101h9m-4-4v8" stroke="currentColor" opacity=".3" stroke-width="1.5"/></svg>`;
}
function missionCard(mission){return `<article class="mission-tile"><button class="mission-favorite" data-action="favorite" data-id="${mission.id}" aria-label="${esc(mission.title)} 즐겨찾기" aria-pressed="${favorites.includes(mission.id)}"><span aria-hidden="true">${favorites.includes(mission.id)?'★':'☆'}</span></button><button class="mission-art ${mission.color}" data-action="guide" data-id="${mission.id}" aria-label="${esc(mission.title)} 가이드">${artwork(mission)}<span class="art-label">${mission.category}</span></button><div class="mission-info"><div class="mission-meta"><span>${icon('clock',13)} 약 ${mission.duration}분</span><span>${mission.level}</span></div><h3><button data-action="guide" data-id="${mission.id}">${mission.title}</button></h3><p>${mission.description}</p><div class="mission-access"><span>PC · 모바일 웹</span><span>로컬 연습</span></div><button class="mission-guide-link" data-action="guide" data-id="${mission.id}">가이드 보기 ${icon('arrow',15)}</button><div class="mission-foot"><span>통과 시 ${formatMoney(mission.reward)} · 예시</span><button class="icon-button" data-action="camera" data-id="${mission.id}" aria-label="${mission.title} 촬영">${icon('arrow',18)}</button></div></div></article>`;}
function clipStatus(clip){const submission=state.service.submissions.find(item=>item.clipId===clip.id);return submission?{status:submission.status,label:`이전 기록 · ${reviewStatusLabel(submission.status)}`}:{status:clip.status,label:statusLabel(clip.status)};}
function clipRows(clips){return `<div class="record-table"><div class="record-head"><span>기록 이름</span><span>상태</span><span>길이</span><span>저장일</span><span></span></div>${clips.map(clip=>`<button class="record-row" data-action="clip" data-id="${esc(clip.id)}"><span class="record-name"><span class="record-thumb ${getMission(clip.missionId).color}">${icon('play',19)}</span><span><b>${esc(clip.title)}</b><small>${esc(clip.category)} · ${clip.example?'예시 기록':clip.source==='camera'?'카메라 촬영':'가져온 영상'}</small></span></span><span><span class="badge ${clipStatus(clip).status}">${clipStatus(clip).label}</span></span><span class="record-length">${formatDuration(clip.duration)}</span><span class="record-date">${date(clip.createdAt)}</span><span>${icon('chevron',17)}</span></button>`).join('')}</div>`;}
function empty(){return `<div class="empty-state"><div class="empty-illustration">${icon('video',32)}</div><h3>아직 보관한 영상이 없습니다.</h3><p>촬영한 영상을 가져와 제목과 메모를 정리하세요.</p><div class="empty-actions"><button class="button primary" data-action="camera">${icon('camera',17)} 바로 촬영</button><button class="button" data-action="upload">${icon('upload',17)} 영상 가져오기</button><a class="button" href="#guide">촬영 교육 보기</a></div></div>`;}
function pageHeading(eyebrow,title,description,action=''){return `<div class="page-heading"><div>${eyebrow?`<p class="eyebrow">${eyebrow}</p>`:''}<h1>${title}</h1>${description?`<p class="page-description">${description}</p>`:''}</div>${action}</div>`;}

const filmingEstimate={activity:capturePlan.selected||captureActivities[0].id,quantity:3};
const filmingEstimateTerms={seconds:300,reward:3000,max:20};
function filmingRewardPreview(){
  const {activity,quantity}=filmingEstimate,{seconds,reward,max}=filmingEstimateTerms;
  return `<section id="capture-reward-preview" class="filming-estimate" aria-labelledby="estimate-title">
    <h3 id="estimate-title">촬영 포인트 미리보기</h3>
    <label class="estimate-activity-label" for="estimate-activity">촬영할 활동</label>
    <select id="estimate-activity">${captureActivities.map(item=>`<option value="${item.id}" ${item.id===activity?'selected':''}>${esc(item.title)}</option>`).join('')}</select>
    <div class="estimate-duration"><span>영상 1개</span><strong>약 ${seconds}초 <span>(5분)</span></strong></div>
    <div class="estimate-quantity-head"><label for="estimate-count">촬영할 영상 수</label><div class="estimate-stepper">
      <button type="button" data-action="estimate-decrease" aria-label="촬영 영상 수 줄이기" ${quantity===1?'disabled':''}>−</button>
      <output id="estimate-count-value" for="estimate-count" aria-live="off">${quantity}개</output>
      <button type="button" data-action="estimate-increase" aria-label="촬영 영상 수 늘리기" ${quantity===max?'disabled':''}>+</button>
    </div></div>
    <input id="estimate-count" type="range" min="1" max="${max}" step="1" value="${quantity}" aria-valuetext="${quantity}개" style="--estimate-fill:${(quantity-1)/(max-1)*100}%">
    <div class="estimate-range-labels" aria-hidden="true"><span>1개</span><span>${max}개</span></div>
    <div class="estimate-result"><span id="estimate-total-label">검수 통과 시 예상 포인트</span><output id="estimate-total" for="estimate-count" aria-labelledby="estimate-total-label" aria-describedby="estimate-condition" aria-live="off">${points(quantity*reward)}</output><p>총 촬영 분량 <strong id="estimate-time">약 ${quantity*seconds/60}분</strong></p></div>
    <p id="estimate-condition" class="estimate-condition">영상당 3,000P · 모두 검수에 통과한 경우입니다.</p>
    <button id="estimate-detail" class="text-action" type="button" data-action="capture-detail" data-id="${activity}">선택한 활동 자세히 보기 ${icon('arrow',16)}</button>
    <p id="estimate-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
  </section>`;
}
function updateFilmingEstimate(quantity,{announce=false,animate=true}={}){
  const section=document.querySelector('#capture-reward-preview');
  if(!section||!Number.isInteger(quantity))return;
  const {seconds,reward,max}=filmingEstimateTerms;
  const next=Math.min(max,Math.max(1,quantity)),changed=next!==filmingEstimate.quantity;
  filmingEstimate.quantity=next;
  const slider=section.querySelector('#estimate-count'),total=section.querySelector('#estimate-total');
  slider.value=String(next);slider.setAttribute('aria-valuetext',`${next}개`);slider.style.setProperty('--estimate-fill',`${(next-1)/(max-1)*100}%`);
  section.querySelector('#estimate-count-value').textContent=`${next}개`;
  total.textContent=points(next*reward);
  section.querySelector('#estimate-time').textContent=`약 ${next*seconds/60}분`;
  section.querySelector('[data-action="estimate-decrease"]').disabled=next===1;
  section.querySelector('[data-action="estimate-increase"]').disabled=next===max;
  if(announce)section.querySelector('#estimate-status').textContent=`${captureById(filmingEstimate.activity).title} ${next}개, 총 약 ${next*seconds/60}분. 모두 검수 통과 시 ${points(next*reward)}.`;
  if(changed&&animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    total.getAnimations().forEach(animation=>animation.cancel());
    total.animate([{opacity:.55,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:120,easing:'ease-out'});
  }
}

function home(){
  const signedIn=getStudioAccess()==='allowed',real=signedIn?state.clips.filter(clip=>!clip.example):[],selected=selectedCapture(),done=trainingComplete(),ready=preflightCount();
  const next=!selected?['손과 작업 대상이 보이도록 카메라를 고정하세요.','짧은 촬영 가이드','guide','training']:!done?[`${selected.title} 촬영 준비`,'촬영 교육 보기','guide','training']:ready<4?[`${selected.title} 촬영 전 점검 · ${ready}/4`,'점검 이어하기','guide','preflight']:[`${selected.title} 촬영 준비 완료`,'바로 촬영','camera',''];
  return `${pageHeading('','한국의 일상을 촬영하고,<br>포인트를 모으세요.','',`<button class="button primary" data-action="camera">${icon('camera',17)} 바로 촬영</button><a class="button" href="#missions" data-home-start>촬영 활동 고르기 ${icon('arrow',17)}</a>`)}
    <section class="home-lusion-hero" aria-labelledby="home-lusion-title">
      <div class="home-lusion-copy">
        <h2 id="home-lusion-title">지금 쓰는 기기로 바로 촬영하세요.</h2>
        <p>한국에서 하는 일상의 손동작을 Physical AI 학습 데이터로 기록해요. 본인 자택에서 가로 촬영하고, 손과 작업 대상이 보이도록 해주세요.</p>
        ${filmingRewardPreview()}
        <aside class="capture-next" aria-labelledby="capture-next-title"><h3 id="capture-next-title">${esc(next[0])}</h3><div class="capture-next-actions">${next[2]==='camera'?`<button class="button" data-action="camera" data-id="${selected.id}">바로 촬영 ${icon('camera',16)}</button>`:next[2]==='guide'?`<button class="button" data-action="guide-section" data-guide-target="${next[3]}">${next[1]} ${icon('arrow',16)}</button>`:`<button class="button" data-action="collection-${next[2]}">${next[1]} ${icon('arrow',16)}</button>`}</div></aside>
      </div>
      ${collectionExamplePlayer(true)}
    </section>
    <section class="content-section capture-recent"><div class="section-title"><h2>보관한 영상</h2><a class="text-action" href="#library">전체 보기 ${icon('arrow',16)}</a></div><div class="panel">${!signedIn?`<div class="home-record-empty"><p>로그인하면 보관한 영상을 확인할 수 있습니다.</p><a class="button" href="#library">로그인 ${icon('arrow',16)}</a></div>`:real.length?clipRows(real.slice(0,3)):`<div class="home-record-empty"><p>아직 보관한 영상이 없습니다.</p><button class="button" data-action="upload">${icon('upload',17)} 영상 가져오기</button></div>`}</div></section>`;
}
function practiceMissionPage(){return `${pageHeading('촬영 도구 연습','공용 연습 미션으로 도구를 확인해요','아래 목록은 로컬 체험용입니다. 실제 집안일 영상 수집 활동과 보상 조건은 위 촬영 활동을 기준으로 확인하세요.')}<div class="mission-toolbar"><label class="search-field">${icon('search',18)}<input id="mission-search" type="search" placeholder="미션 이름, 분야, 동작 검색" value="${esc(state.missionQuery)}" aria-label="미션 검색"></label><label class="mission-select-label" for="mission-duration">예상 시간<select id="mission-duration"><option value="all">모든 시간</option>${[3,5].map(duration=>`<option value="${duration}" ${state.missionDuration===String(duration)?'selected':''}>${duration}분 이내</option>`).join('')}</select></label><label class="mission-select-label" for="mission-level">난이도<select id="mission-level"><option value="all">모든 난이도</option>${[...new Set(missions.map(m=>m.level))].map(level=>`<option value="${esc(level)}" ${state.missionLevel===level?'selected':''}>${esc(level)}</option>`).join('')}</select></label></div><div class="mission-saved-row"><button class="filter-chip" id="favorites-filter" data-action="favorites-filter" aria-pressed="${favoritesOnly}">★ 즐겨찾기만</button><span>${favoritesPersistent?'즐겨찾기는 이 브라우저에 저장돼요.':'즐겨찾기는 현재 화면에서만 유지돼요.'}</span></div><div class="filter-row" aria-label="미션 분야">${['전체',...new Set(missions.map(m=>m.category))].map(category=>`<button class="filter-chip ${state.category===category?'active':''}" data-action="category" data-category="${category}" aria-pressed="${state.category===category}">${category}</button>`).join('')}</div><p id="mission-count" class="mission-results-count" role="status" aria-live="polite" aria-atomic="true"></p><div id="mission-results" aria-label="미션 검색 결과"></div><section class="reward-calculator panel" aria-labelledby="reward-title"><div><span class="account-kicker">연습용 계산기</span><h2 id="reward-title">공용 미션을 연습한다면?</h2><p>예시 단가 × 통과 건수로 계산해요. 실제 모집·수익이나 통과를 보장하지 않아요.</p><div class="reward-inputs"><label>예시 미션<select id="reward-mission">${missions.map(m=>`<option value="${m.id}">${esc(m.title)}</option>`).join('')}</select></label><label>예시 통과 건수<input id="reward-quantity" type="number" min="1" max="100" step="1" value="1"></label></div></div><div class="reward-result"><span>예시 보상 합계</span><output id="reward-total" aria-live="polite">${formatMoney(missions[0].reward)}</output><small>시연 금액 · 실제 지급 없음</small></div></section><div class="guide-banner"><span>${icon('book',26)}</span><div><h3>좋은 기록은 좋은 준비에서</h3><p>촬영 전 1분, 손과 물건이 잘 보이는지 확인해보세요.</p></div><a class="button" href="#guide">촬영 교육 ${icon('arrow',16)}</a></div>`;}

function missionPage(){return `${pageHeading('','촬영 활동','',`<button class="button" data-action="collection-apply">참여 방법</button>`)}<section class="capture-program-summary" aria-label="공통 촬영 조건"><p>한국 내 본인 자택 · 휴대폰·노트북 카메라 · 가로 영상 약 5분</p><strong>검수 통과 시 건당 3,000P</strong></section>${capturePlanNotice()?`<p id="capture-storage-status" class="favorites-storage-notice" role="status">${esc(capturePlanNotice())}</p>`:'<p id="capture-storage-status" class="sr-only" role="status"></p>'}${captureCatalogMarkup()}`;}
function renderMissionResults(){
  const query=state.missionQuery.trim().toLowerCase();
  const filtered=missions.filter(m=>(!favoritesOnly||favorites.includes(m.id))&&(state.category==='전체'||m.category===state.category)&&(state.missionDuration==='all'||m.duration<=Number(state.missionDuration))&&(state.missionLevel==='all'||m.level===state.missionLevel)&&`${m.title} ${m.category} ${m.description}`.toLowerCase().includes(query));
  document.querySelector('#favorites-filter').setAttribute('aria-pressed',String(favoritesOnly));
  document.querySelector('#favorites-filter').classList.toggle('active',favoritesOnly);
  document.querySelector('#mission-count').textContent=`전체 ${missions.length}개 중 ${filtered.length}개의 연습 미션`;
  document.querySelector('#mission-results').innerHTML=filtered.length?`<div class="mission-grid all-missions">${filtered.map(missionCard).join('')}</div>`:`<div class="empty-state">${icon('search',32)}<h3>조건에 맞는 미션이 없어요</h3><p>검색어를 바꾸거나 시간·난이도·분야를 넓혀보세요.</p><button class="button" data-action="reset-mission-filter">미션 검색 초기화</button></div>`;
  document.querySelectorAll('[data-action="category"]').forEach(button=>{const active=button.dataset.category===state.category;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
}
function library(){return `${pageHeading('','보관한 영상','',`<button class="button primary" data-action="camera">${icon('camera',17)} 바로 촬영</button><button class="button" data-action="upload">${icon('upload',17)} 영상 가져오기</button>`)}<p class="library-storage-note">이 브라우저에 저장된 영상이며, 자동으로 제출되지 않습니다.</p><div class="library-toolbar"><label class="search-field">${icon('search',18)}<input id="record-search" type="search" placeholder="기록 이름, 활동, 메모 검색" value="${esc(state.query)}" aria-label="내 기록 검색"></label><label class="sr-only" for="record-status">기록 상태</label><select id="record-status"><option value="all">모든 상태</option>${['submitted','reviewing','approved','rejected'].map(status=>`<option value="${status}" ${state.status===status?'selected':''}>이전 기록 · ${reviewStatusLabel(status)}</option>`).join('')}<option value="ready" ${state.status==='ready'?'selected':''}>준비 완료</option><option value="draft" ${state.status==='draft'?'selected':''}>초안</option></select><label class="sr-only" for="record-sort">정렬 순서</label><select id="record-sort"><option value="newest">최신순</option><option value="oldest" ${state.sort==='oldest'?'selected':''}>오래된순</option><option value="title" ${state.sort==='title'?'selected':''}>이름순</option></select></div><div class="library-summary"><span id="record-count"></span><span>저장 공간 ${formatBytes(state.clips.reduce((sum,c)=>sum+c.size,0))}</span></div><section class="panel" id="library-results" aria-label="저장한 기록"></section><div class="bottom-note">${icon('help',17)}<p>브라우저 데이터를 삭제하면 영상도 지워집니다. 필요한 파일은 다운로드해 보관하세요.</p></div>`;}
function renderLibraryResults(){
  const filtered=state.clips.filter(c=>(state.status==='all'||clipStatus(c).status===state.status)&&`${c.title} ${c.category} ${c.notes}`.toLowerCase().includes(state.query.toLowerCase()));
  if(state.sort==='oldest')filtered.reverse();if(state.sort==='title')filtered.sort((a,b)=>a.title.localeCompare(b.title,'ko'));
  document.querySelector('#record-count').textContent=`전체 ${state.clips.length}개 · 표시 ${filtered.length}개`;
  document.querySelector('#library-results').innerHTML=!state.clips.length?empty():filtered.length?clipRows(filtered):`<div class="empty-state">${icon('search',32)}<h3>일치하는 기록이 없어요</h3><p>다른 검색어나 상태를 선택해주세요.</p><button class="button" data-action="reset-filter">검색 초기화</button></div>`;
}
function trainingSections(){
  const quiz=[
    ['q1','촬영 방향은 무엇이 기준인가요?',[['landscape','가로 화면으로 촬영'],['portrait','세로 화면으로 촬영']]],
    ['q2','촬영 전 화면에서 먼저 치워야 하는 것은?',[['tools','작업에 쓰는 식기와 옷'],['privacy','얼굴, 주소, 신분증 같은 개인정보']]],
    ['q3','집안일 동작은 어떻게 해야 하나요?',[['natural','평소처럼 자연스러운 속도로 진행'],['acting','카메라를 향해 과장해서 반복']]],
  ];
  const progress=trainingComplete(),preflight=preflightCount(),activity=selectedCapture();
  return `<section class="training-path" data-guide-section="training" aria-labelledby="training-title" tabindex="-1"><div class="section-title"><div><h2 id="training-title">촬영 준비 3단계</h2><p>실제 예시를 보고 아래 순서대로 준비하세요.</p></div><span class="training-state ${progress?'done':''}">${progress?'교육 확인 완료':'교육 확인 전'}</span></div><ol class="filming-guide-steps"><li><span class="filming-step-number" aria-hidden="true">01</span><div><h3>내 시점에서, 가로로</h3><p>휴대폰이나 노트북 카메라를 작업대 쪽으로 고정해요. 가로 화면에 작업 공간이 들어오는지 예시 영상과 비교하세요.</p></div></li><li><span class="filming-step-number" aria-hidden="true">02</span><div><h3>손과 작업 대상을 함께</h3><p>양손과 물건 전체가 화면에 들어오도록 각도를 맞춰요. 설거지나 빨래 개기 같은 일상 동작을 평소 속도와 순서로 기록하세요.</p></div></li><li><span class="filming-step-number" aria-hidden="true">03</span><div><h3>밝고 안정적으로, 약 5분</h3><p>충분히 밝은 곳에서 흔들림을 줄이고 하나의 활동을 약 5분 촬영해요. 시작 전에 짧게 찍어 손과 물건이 선명하게 보이는지 확인하세요.</p></div></li></ol><p class="filming-privacy-note">촬영 전 얼굴, 주소, 문서, 차량번호를 화면 밖으로 치우고, 위험한 동작은 촬영하지 마세요.</p></section><section class="training-quiz panel" data-guide-section="quiz" aria-labelledby="training-quiz-title" tabindex="-1"><div><h2 id="training-quiz-title">촬영 기준 확인</h2>${trainingPersistent?'':'<p role="status">저장할 수 없어 완료 표시는 현재 화면에서만 유지됩니다.</p>'}</div><div class="quiz-list">${quiz.map(([id,question,options],index)=>`<fieldset><legend>${index+1}. ${question}</legend>${options.map(([value,label])=>`<button type="button" data-action="training-answer" data-question="${id}" data-answer="${value}" aria-pressed="${training.answers[id]===value}">${label}</button>`).join('')}<p class="quiz-feedback" role="status">${training.answers[id]?training.answers[id]===trainingAnswers[id]?'정답입니다.':'촬영 기준을 다시 확인해주세요.':''}</p></fieldset>`).join('')}</div><div class="training-complete-row"><button class="button primary" data-action="complete-training">${progress?'교육 완료':'교육 완료 확인'} ${icon('checkCircle',17)}</button><span id="training-message" role="status">${progress?'촬영 전 점검을 진행해주세요.':'3개 문항에 답한 뒤 완료를 눌러주세요.'}</span></div></section><section class="submission-preflight readiness-checklist panel" data-guide-section="preflight" aria-labelledby="submission-preflight-title" tabindex="-1"><div><h2 id="submission-preflight-title">촬영 전 마지막 점검</h2><p>${preflight}/4개 확인됨.</p></div><label><input type="checkbox" data-preflight="headgear" ${training.preflight.headgear?'checked':''}>카메라를 고정하고 손과 작업 대상이 보이는지 확인했습니다.</label><label><input type="checkbox" data-preflight="landscape" ${training.preflight.landscape?'checked':''}>가로 화면에 손과 작업 대상이 모두 보입니다.</label><label><input type="checkbox" data-preflight="fiveMinutes" ${training.preflight.fiveMinutes?'checked':''}>약 5분 동안 하나의 집안일을 촬영합니다.</label><label><input type="checkbox" data-preflight="privacy" ${training.preflight.privacy?'checked':''}>얼굴, 주소, 문서 등 개인정보가 보이지 않습니다.</label><div class="empty-actions"><button class="button primary" data-action="collection-submit">제출 방법 확인</button><button class="button" data-action="upload">${icon('upload',17)} 영상 가져오기</button><button class="button" data-action="reset-preflight" ${preflight?'':'disabled'}>점검 초기화</button></div></section>`;
}
function guide(){
  const activity=selectedCapture();
  const questions=[
    ['촬영 활동을 고르면 바로 신청되나요?','활동 선택은 촬영할 내용을 정하는 단계입니다. 로그인 후 바로 촬영할 수 있으며, 저장한 영상은 동의 내용을 확인하고 심사 제출하기를 눌러야 접수됩니다.'],
    ['영상은 어디에 저장되고, 어떻게 제출하나요?','가져온 영상은 현재 브라우저에 저장되며 자동 제출되지 않습니다. 필요한 영상은 미리 다운로드해 두세요. 바로 촬영한 영상도 이 브라우저에 저장됩니다. 검토 후 ‘심사 제출하기’ 또는 ‘제출·심사’에서 직접 제출하세요.'],
    ['포인트는 어떻게 적립되나요?','한국에서 촬영한 약 5분의 집안일 영상이 검수 기준을 통과하면 1건당 3,000P가 적립됩니다. 제출만으로는 적립되지 않습니다. 현재 포인트로만 운영하며, 국내 은행 연동 예정으로 출금은 아직 이용할 수 없습니다.'],
    ['어떤 영상 파일을 가져올 수 있나요?','브라우저에서 재생할 수 있는 250 MB 이하 영상 한 개를 가져올 수 있습니다. MP4와 WebM을 권장하며, MOV 등 다른 형식은 기기와 브라우저에 따라 지원이 달라집니다.'],
  ];
  return `${pageHeading('','촬영 교육','')}
    <section class="capture-guide-context" aria-label="촬영 교육 안내">
      ${activity?`<div><h2 id="capture-guide-context-title">${esc(activity.title)} 촬영 준비</h2></div>`:''}
      <div class="capture-guide-nav" role="group" aria-label="촬영 교육 바로가기"><button type="button" class="button" data-action="guide-section" data-guide-target="examples">예시 영상</button><button type="button" class="button" data-action="guide-section" data-guide-target="training">촬영 기준</button><button type="button" class="button" data-action="guide-section" data-guide-target="quiz">확인 문제</button><button type="button" class="button" data-action="guide-section" data-guide-target="preflight">촬영 전 점검</button></div>
      <a class="text-action" href="#missions">${activity?'다른 활동 고르기':'활동 고르기'} ${icon('arrow',16)}</a>
    </section>
    <div data-guide-section="examples" tabindex="-1">${collectionExamplePlayer()}</div>${trainingSections()}
    <section class="content-section guide-faq-section"><div class="section-title"><h2>자주 묻는 질문</h2></div><div class="guide-faq">${questions.map(([question,answer],index)=>`<details ${guideFaqOpen.includes(index)?'open':''}><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div></section>`;
}

function profile(){
  const value=state.profileDraft||state.profile;
  return `
    <div class="page-heading"><h1>계정 및 설정</h1></div>
    <div class="profile-grid">
      <section class="profile-panel" aria-labelledby="phone-verification-title">
        <div class="phone-verification-heading"><h2 id="phone-verification-title">휴대폰 번호 인증</h2><span class="phone-maintenance-badge">점검 중</span></div>
        <p class="phone-maintenance-note" id="phone-maintenance-note">휴대폰 인증은 점검 중입니다.</p>
        
        <fieldset class="phone-verification-fields" disabled aria-describedby="phone-maintenance-note">
          <legend class="sr-only">휴대폰 인증 — 점검 중</legend>
          <label for="verification-phone">휴대폰 번호</label>
          <div class="phone-verification-row"><input id="verification-phone" type="tel" autocomplete="tel" placeholder="010-0000-0000" disabled><button class="button" type="button" disabled>인증번호 발송</button></div>
          <label for="verification-code">인증번호</label>
          <div class="phone-verification-row"><input id="verification-code" inputmode="numeric" autocomplete="one-time-code" placeholder="인증번호 입력" disabled><button class="button" type="button" disabled>인증 확인</button></div>
        </fieldset>
        <details class="device-record-settings" ${state.profileDraft||state.profileMessage?'open':''}>
          <summary id="record-settings-title">기록 설정</summary>
          <p class="device-settings-note">이름·목표·사진은 현재 브라우저에만 적용됩니다.</p>
          <form id="profile-form">
          <label>기록용 이름<input id="profile-name" maxlength="24" required value="${esc(value.name)}" autocomplete="nickname"></label>
          <label>기록 목표<select id="profile-goal">${Array.from({length:30},(_,i)=>i+1).map(goal=>`<option value="${goal}" ${Number(value.goal)===goal?'selected':''}>${goal}개 기록하기</option>`).join('')}</select></label>
          <details class="device-photo-settings">
            <summary>기록용 사진</summary>
            <div class="device-photo-controls"><span class="avatar" aria-label="이 기기에 저장한 사진">${avatarMarkup(value.name)}</span><div><button type="button" class="profile-photo-link" data-action="profile-photo">사진 수정</button></div></div>
          </details>
          <button class="button primary" type="submit">기록 설정 저장</button>
          <p id="profile-message" class="form-message" role="status">${esc(state.profileMessage)}</p>
          </form>
        </details>
      </section>
      <aside class="profile-storage">
        <section class="device-storage-panel" aria-labelledby="video-storage-title">
          <h2 id="video-storage-title">영상 보관</h2>
          <p>영상은 이 브라우저에 보관됩니다.<br>필요한 영상은 미리 다운로드하세요.</p>
          <a class="button" href="#library">보관한 영상 보기</a>
          <a class="text-action" href="#support">문의·도움 ${icon('arrow',16)}</a>
        </section>
      </aside>
    </div>`;
}
function servicePage(route){const copy={reviews:['','제출 안내',''],wallet:['','포인트',''],shop:['','상점·주문',''],support:['','문의·도움','']}[route];return `${pageHeading(...copy)}<div id="service-content"></div>`;}

function loginGate(route,access){
  const checking=access==='checking',pending=access==='registrationRequired',unavailable=access==='unavailable';
  const copy={library:'영상을 가져오고 보관한 기록을 관리할 수 있습니다.',profile:'계정 정보와 개인 설정을 확인할 수 있습니다.',reviews:'제출한 영상과 심사 결과를 확인할 수 있습니다.',wallet:'승인된 영상의 포인트 내역을 확인할 수 있습니다. 국내 은행 연동 예정으로, 현재 출금은 지원하지 않습니다.',shop:'촬영 장비와 내 주문 내역을 확인할 수 있습니다.'}[route];
  const title=checking?'로그인 확인 중':pending?'가입을 완료해주세요.':unavailable?'로그인에 연결하지 못했습니다.':'로그인 후 이용할 수 있습니다.';
  return `${pageHeading('',titles[route],'')}<section class="studio-login-gate" data-access="${access}" aria-labelledby="login-gate-title" aria-busy="${checking}"><h2 id="login-gate-title">${title}</h2><p class="login-gate-copy" role="status">${checking?'잠시만 기다려주세요.':pending?'필수 확인을 마치면 이용할 수 있습니다.':unavailable?'연결 상태를 확인한 뒤 다시 시도해주세요.':copy}</p><div class="login-gate-actions">${checking?'':`<button type="button" class="button primary" data-action="login-required">${pending?'가입 완료하기':unavailable?'다시 연결하기':'로그인 / 회원가입'} ${icon('arrow',17)}</button>`}<a class="button" href="#missions">촬영 활동 둘러보기</a></div></section>`;
}
function render(){
  releaseGuideFaq();releaseGuideFaq=()=>{};
  const previousFaq=main.querySelector('.guide-faq');
  if(previousFaq)guideFaqOpen=[...previousFaq.querySelectorAll('details')].flatMap((item,index)=>item.open?[index]:[]);
  reviewObserver?.disconnect();
  const focused=document.activeElement, focusId=focused?.id,selection=focused instanceof HTMLInputElement ? focused.selectionStart : null;
  state.route=['home','missions','guide','library','profile','reviews','wallet','shop','support'].includes(location.hash.slice(1))?location.hash.slice(1):'home';
  document.querySelector('#current-page').textContent=titles[state.route];document.title=`${titles[state.route]} · 60BASE`;
  document.querySelectorAll('[data-nav]').forEach(link=>{link.classList.toggle('active',link.dataset.nav===state.route);if(link.dataset.nav===state.route)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  const mobile=matchMedia('(max-width: 720px)').matches,tools=document.querySelector('.studio-tools');if(tools)tools.open=!mobile&&['reviews','wallet','shop'].includes(state.route);
  if(mobile){const nav=document.querySelector('.side-nav'),active=nav.querySelector('.active');if(active){const left=active.offsetLeft-nav.offsetLeft;nav.scrollLeft=Math.max(0,left-(nav.clientWidth-active.offsetWidth)/2);}}
  main.classList.toggle('settings-route',state.route==='profile');
  const access=getStudioAccess();main.dataset.access=access;
  if(state.route!=='profile')state.profileMessage='';
  if(requiresStudioAccount(state.route)&&access!=='allowed'){main.innerHTML=loginGate(state.route,access);return;}
  if(state.loading){main.innerHTML='<div class="empty-state" role="status">기록을 불러오고 있어요…</div>';return;}
  if(state.error&&!state.service){main.innerHTML=`<div class="error-box" role="alert">${esc(state.error)} <button class="button" data-action="reload">다시 불러오기</button></div>`;return;}
  const banner=accountBanner(state.route),content=({home,missions:missionPage,library,guide,profile,reviews:()=>servicePage('reviews'),wallet:()=>servicePage('wallet'),shop:()=>servicePage('shop'),support:()=>servicePage('support')}[state.route])(),message=state.error?`<div class="error-box" role="alert">${esc(state.error)} <button class="button" data-action="reload">다시 불러오기</button></div>`:'',deferBanner=['home','missions','guide','library'].includes(state.route);
  main.innerHTML=(deferBanner?'':banner)+message+content+(deferBanner?banner:'');
  if(state.route==='guide')releaseGuideFaq=bindSupportFaq(main);
  if(state.route==='missions'&&document.querySelector('#mission-results'))renderMissionResults();
  if(state.route==='library')renderLibraryResults();
  if(state.route==='reviews')void mountOnline('reviews',document.querySelector('#service-content'),()=>renderStudioReviews(document.querySelector('#service-content')));
  if(state.route==='wallet')void mountOnline('wallet',document.querySelector('#service-content'),()=>renderWallet(document.querySelector('#service-content'),state.service));
  if(state.route==='shop')void mountOnline('shop',document.querySelector('#service-content'),()=>renderShop(document.querySelector('#service-content'),state.service));
  if(state.route==='support')void mountOnline('support',document.querySelector('#service-content'),()=>{document.querySelector('#service-content').innerHTML='<section class="online-panel"><h2>문의·도움</h2><p>계정, 촬영, 제출, 영상 삭제와 동의 철회에 관한 문의는 60base.ai@gmail.com으로 보내주세요.</p></section>';});
  void enhanceOnlineShell(state.route,main);
  if(focusId){const next=document.getElementById(focusId);if(next&&main.contains(next)){next.focus({preventScroll:true});if(selection!==null&&next instanceof HTMLInputElement&&['text','search'].includes(next.type))next.setSelectionRange(selection,selection);}}
}
window.addEventListener('service-session',()=>{if(cameraContext&&!cameraIsCurrent())closeStudioCamera();if(!state.loading)render();});
let refreshVersion=0;
async function refresh(){const version=++refreshVersion;try{const[clips,profile,service]=await Promise.all([getClips(),getProfile(),getServiceState()]);if(version!==refreshVersion)return;state.clips=clips;state.profile=profile;state.service=service;state.error='';}catch(error){if(version!==refreshVersion)return;state.error=error.message||'저장소를 열지 못했어요. 일반 브라우저 창에서 다시 시도해주세요.';}state.loading=false;render();updateReviewDialog();}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
  if(action==='estimate-decrease'||action==='estimate-increase'){updateFilmingEstimate(filmingEstimate.quantity+(action==='estimate-increase'?1:-1),{announce:true});return;}
  if(action==='login-required'){void showAccountEntry({returnTo:location.hash});return;}
  if(['upload','camera','clip','profile-photo','review-progress','account','withdraw','review-demo','examples'].includes(action)&&getStudioAccess()!=='allowed'){
    event.preventDefault();location.hash=action==='profile-photo'||action==='account'?'profile':'library';return;
  }
  if(action==='app-coming-soon'){event.preventDefault();openAppComingSoon();return;}
  if(action==='account-entry'||action==='account-entry-panel'||action==='identity-entry'||action==='earnings-entry')openAccountEntry(action);
  if(action==='favorite'){
    const id=button.dataset.id;if(!missions.some(m=>m.id===id))return;
    favorites=favorites.includes(id)?favorites.filter(item=>item!==id):[...favorites,id];
    if(favoritesPersistent){try{localStorage.setItem(favoriteKey,JSON.stringify(favorites));}catch{favoritesPersistent=false;const notice=document.querySelector('#studio-account-status');notice.className='favorites-storage-notice';notice.textContent=favoritesMemoryNotice;const hint=document.querySelector('.mission-saved-row>span');if(hint)hint.textContent='즐겨찾기는 현재 화면에서만 유지돼요.';}}
    if(state.route==='missions'){renderMissionResults();(document.querySelector(`[data-action="favorite"][data-id="${id}"]`)||document.querySelector('#favorites-filter')).focus();}
    else{button.setAttribute('aria-pressed',String(favorites.includes(id)));button.querySelector('span').textContent=favorites.includes(id)?'★':'☆';}
  }
  if(action==='favorites-filter'){favoritesOnly=!favoritesOnly;renderMissionResults();}
  if(action==='upload')void openLocalImport();
  if(action==='camera'){button.closest('dialog')?.close();launchStudioCamera(button.dataset.id);}
  if(action==='account')void openAccount();
  if(action==='withdraw')void openWithdraw();
  if(action==='review-demo')void openReviewDemo();
  if(action==='profile-photo')openProfilePhoto();
  if(action==='review-progress')openReviewProgress(button.dataset.id);
  if(action==='guide')openGuide(button.dataset.id);
  if(action==='clip')void openLocalClip(button.dataset.id);
  if(action==='capture-detail')openCaptureDetail(button.dataset.id);
  if(action==='capture-save'){
    const id=button.dataset.id;if(!captureById(id))return;
    const saved=capturePlan.saved.includes(id),next=saved?capturePlan.saved.filter(item=>item!==id):[...capturePlan.saved,id];
    const persisted=writeCapturePlan({saved:next}),nowSaved=capturePlan.saved.includes(id),dialog=button.closest('#capture-detail-dialog');
    if(dialog){
      button.setAttribute('aria-pressed',String(nowSaved));button.textContent=nowSaved?'저장 해제':'활동 저장';
      const status=dialog.querySelector('#capture-detail-status');if(status)status.textContent=persisted?nowSaved?'활동을 저장했어요.':'저장한 활동에서 해제했어요.':capturePlanNotice();
      renderCaptureCatalog();button.focus({preventScroll:true});
    }
    else if(state.route==='missions'){renderCaptureCatalog();(document.querySelector(`[data-action="capture-save"][data-id="${id}"]`)||document.querySelector('#capture-saved-filter'))?.focus({preventScroll:true});}
    else{render();}
  }
  if(action==='capture-prepare'){
    const id=button.dataset.id;if(!captureById(id))return;
    selectCapture(id,{resetPreflight:true,syncExample:true});
    button.closest('dialog')?.close();
    goToGuide(trainingComplete()?'preflight':'training');
  }
  if(action==='capture-category'){state.captureCategory=button.dataset.captureCategory||'전체';renderCaptureCatalog();}
  if(action==='capture-example-filter'){state.captureExamplesOnly=!state.captureExamplesOnly;renderCaptureCatalog();document.querySelector('#capture-example-filter')?.focus({preventScroll:true});}
  if(action==='capture-saved-filter'){state.captureSavedOnly=!state.captureSavedOnly;renderCaptureCatalog();document.querySelector('#capture-saved-filter')?.focus({preventScroll:true});}
  if(action==='reset-capture-filter'){state.captureQuery='';state.captureCategory='전체';state.captureExamplesOnly=false;state.captureSavedOnly=false;const input=document.querySelector('#capture-search');if(input)input.value='';renderCaptureCatalog();document.querySelector('#capture-search')?.focus();}
  if(action==='guide-section'){button.closest('dialog')?.close();goToGuide(button.dataset.guideTarget||'training');}
  if(action==='collection-apply'||action==='collection-submit')openCollectionInstructions(action==='collection-submit');
  if(action==='scroll-examples'){document.querySelector('.collection-examples')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});document.querySelector('.collection-examples video')?.focus({preventScroll:true});}
  if(action==='collection-example'){writeTraining({example:button.dataset.example});render();document.querySelector(`[data-example="${training.example}"]`)?.focus({preventScroll:true});}
  if(action==='training-answer'){writeTraining({answers:{...training.answers,[button.dataset.question]:button.dataset.answer},completed:false});render();document.querySelector(`[data-question="${button.dataset.question}"][data-answer="${button.dataset.answer}"]`)?.focus({preventScroll:true});}
  if(action==='complete-training'){const message=document.querySelector('#training-message');if(trainingDone()){writeTraining({completed:true});render();document.querySelector('[data-action="complete-training"]')?.focus({preventScroll:true});}else if(message){message.textContent='정답이 아닌 항목이 있어요. 기준을 다시 확인해주세요.';}}
  if(action==='reset-preflight'){writeTraining({preflight:{}});render();document.querySelector('[data-action="reset-preflight"]')?.focus({preventScroll:true});}
  if(action==='category'){state.category=button.dataset.category;renderMissionResults();}
  if(action==='reset-mission-filter'){favoritesOnly=false;state.category='전체';state.missionQuery='';state.missionDuration='all';state.missionLevel='all';document.querySelector('#mission-search').value='';document.querySelector('#mission-duration').value='all';document.querySelector('#mission-level').value='all';renderMissionResults();document.querySelector('#mission-search').focus();}
  if(action==='reset-filter'){state.query='';state.status='all';state.sort='newest';render();document.querySelector('#record-search').focus();}
  if(action==='reload')void refresh();
  if(action==='examples'){button.disabled=true;try{await addExamples();if(document.querySelector('#example-message'))document.querySelector('#example-message').textContent='예시 기록을 추가했어요. 내 기록에서 확인해주세요.';}catch(error){if(document.querySelector('#example-message'))document.querySelector('#example-message').textContent=error.message;}finally{button.disabled=false;}}
});
function updateReward(event){if(!['reward-mission','reward-quantity'].includes(event.target.id))return;const quantity=document.querySelector('#reward-quantity'),output=document.querySelector('#reward-total');output.textContent=quantity.validity.valid&&quantity.value!==''?formatMoney(getMission(document.querySelector('#reward-mission').value).reward*Number(quantity.value)):'1~100 사이의 정수를 입력해주세요.';}
main.addEventListener('change',updateReward);
main.addEventListener('input',updateReward);
main.addEventListener('input',event=>{if(event.target.id==='estimate-count')updateFilmingEstimate(event.target.valueAsNumber);});
main.addEventListener('change',event=>{
  if(event.target.id==='estimate-count')updateFilmingEstimate(event.target.valueAsNumber,{announce:true,animate:false});
  if(event.target.id==='estimate-activity'&&captureById(event.target.value)){
    filmingEstimate.activity=event.target.value;
    document.querySelector('#estimate-detail').dataset.id=filmingEstimate.activity;
    updateFilmingEstimate(filmingEstimate.quantity,{announce:true,animate:false});
  }
});
main.addEventListener('input',event=>{if(event.target.id==='mission-search'){state.missionQuery=event.target.value;renderMissionResults();}if(event.target.id==='capture-search'){state.captureQuery=event.target.value;renderCaptureCatalog();}if(event.target.id==='record-search'){state.query=event.target.value;renderLibraryResults();}if(['profile-name','profile-goal'].includes(event.target.id)){state.profileMessage='';const message=document.querySelector('#profile-message');if(message)message.textContent='';state.profileDraft={name:document.querySelector('#profile-name').value,goal:Number(document.querySelector('#profile-goal').value)};}});
main.addEventListener('change',event=>{if(event.target.id==='mission-duration'){state.missionDuration=event.target.value;renderMissionResults();}if(event.target.id==='mission-level'){state.missionLevel=event.target.value;renderMissionResults();}if(event.target.id==='record-status'){state.status=event.target.value;renderLibraryResults();}if(event.target.id==='record-sort'){state.sort=event.target.value;renderLibraryResults();}if(event.target.matches('[data-preflight]')){writeTraining({preflight:{...training.preflight,[event.target.dataset.preflight]:event.target.checked}});const count=preflightCount(),note=document.querySelector('.submission-preflight p'),reset=document.querySelector('[data-action="reset-preflight"]');if(note)note.textContent=`${count}/4개 확인됨.`;if(reset)reset.disabled=count===0;}});
main.addEventListener('error',event=>{if(!event.target.matches?.('.example-frame video'))return;const status=event.target.closest('.example-frame')?.querySelector('.example-video-status');if(status)status.textContent='예시 영상을 불러오지 못했어요. 잠시 후 다시 시도해주세요.';},true);
main.addEventListener('submit',async event=>{if(event.target.id!=='profile-form')return;event.preventDefault();const name=document.querySelector('#profile-name').value.trim();const message=document.querySelector('#profile-message');if(!name){message.textContent='표시 이름을 입력해주세요.';return;}const goal=Number(document.querySelector('#profile-goal').value),button=event.target.querySelector('button[type="submit"]');button.disabled=true;try{await saveProfile({name,goal});state.profileDraft=null;state.profile={name,goal};state.profileMessage='이 기기의 기록 설정을 저장했습니다.';render();}catch(error){message.textContent=error.message;}finally{button.disabled=false;}});
addEventListener('hashchange',()=>{closeStudioCamera({preserve:true});document.querySelectorAll('dialog.studio-detail-dialog[open],dialog[data-studio-private][open]').forEach(dialog=>dialog.close());render();window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});});
const missionCountBadge=document.querySelector('[data-nav="missions"] .nav-count');if(missionCountBadge)missionCountBadge.textContent=captureActivities.length;
subscribe(()=>void refresh());icons();void refresh();
let previousAccountKey='';
subscribeStudioAccess(()=>{
  const next=studioAccountKey();if(next===previousAccountKey)return;
  const hadAccount=previousAccountKey.startsWith('allowed:');previousAccountKey=next;
  if(hadAccount){
    closeStudioCamera();
    document.querySelectorAll('dialog[open][data-studio-private],dialog.online-dialog[open]:not(#cloud-account-dialog),#profile-photo-dialog[open],#review-progress-dialog[open]').forEach(element=>element.close());
    state.profileDraft=null;state.profileMessage='';
  }
  render();
});

// Studio-only image data stays separate from the shared app profile.
function validPhoto(value){return typeof value==='string'&&value.length<180000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value);}
function avatarMarkup(name=state.profile.name){return profilePhoto?`<img src="${profilePhoto}" alt="" class="studio-avatar-image">`:esc(name.slice(0,1));}
function studioDialog(id,title,content){
  const opener=document.activeElement,action=opener?.dataset.action,openerId=opener?.dataset.id;
  const dialog=document.createElement('dialog');dialog.id=id;dialog.className='studio-detail-dialog';dialog.setAttribute('aria-labelledby',`${id}-title`);
  dialog.innerHTML=`<header class="studio-detail-head"><div><span class="account-kicker">60BASE · PHYSICAL AI STUDIO</span><h2 id="${id}-title">${title}</h2></div><button class="icon-button" data-detail-close aria-label="닫기" autofocus>${icon('close',20)}</button></header>${content}`;
  dialog.querySelector('[data-detail-close]').onclick=()=>dialog.close();
  dialog.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const controls=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
  dialog.addEventListener('close',()=>{dialog.remove();const fallback=[...document.querySelectorAll('[data-action]')].find(el=>el.dataset.action===action&&el.dataset.id===openerId);(opener?.isConnected?opener:fallback)?.focus({preventScroll:true});},{once:true});
  document.body.append(dialog);dialog.showModal();return dialog;
}
function openAppComingSoon(){
  if(document.querySelector('#app-coming-soon'))return;
  const dialog=studioDialog('app-coming-soon','곧 런칭 예정',`<div class="launch-brand"><img class="launch-logo" src="../assets/brand/60base-logo3-20260914/60base-logo-web.svg" width="117.83" height="23.67" alt="60BASE"><span class="studio-brand-descriptor">PHYSICAL AI STUDIO</span></div><p id="app-launch-description">60BASE 앱을 준비하고 있어요.<br>조금만 기다려 주세요.</p><button type="button" class="button primary" data-launch-confirm>확인</button>`);
  dialog.classList.add('app-launch-dialog');
  dialog.setAttribute('aria-describedby','app-launch-description');
  dialog.querySelector('[data-launch-confirm]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
  });
}
function openProfilePhoto(){
  if(document.querySelector('#profile-photo-dialog'))return;
  const dialog=studioDialog('profile-photo-dialog','나를 보여주는 프로필 사진',`<div class="photo-preview" aria-label="프로필 사진 미리보기">${avatarMarkup()}</div><p class="photo-crop-note">사진 중앙을 정사각형으로 잘라 원형으로 표시해요.</p><label class="photo-file-label">사진 선택<input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="photo-crop-note">JPG · PNG · WebP, 최대 5MB</p><p id="photo-status" role="status" aria-live="polite"></p><div class="photo-actions"><button class="button" data-photo-remove>기본 이미지로 변경</button><button class="button" data-photo-cancel>취소</button><button class="button primary" data-photo-save disabled>사진 저장</button></div>`);
  let draft=profilePhoto,version=0,baseline;
  const status=dialog.querySelector('#photo-status'),save=dialog.querySelector('[data-photo-save]'),preview=dialog.querySelector('.photo-preview');
  try{baseline=localStorage.getItem(photoKey);}catch{status.textContent='사진 저장소에 접근할 수 없어요. 브라우저 저장 설정을 확인해주세요.';}
  if(photoReadError)status.textContent='저장된 사진을 읽지 못했어요. 새 사진을 선택해 다시 저장할 수 있어요.';
  const show=()=>{preview.innerHTML=draft?`<img src="${draft}" alt="선택한 프로필 사진 미리보기">`:esc(state.profile.name.slice(0,1));save.disabled=false;};
  dialog.querySelector('[data-photo-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('[data-photo-remove]').onclick=()=>{version++;draft='';show();status.textContent='기본 이미지로 변경하려면 사진 저장을 눌러주세요.';};
  dialog.addEventListener('close',()=>version++,{once:true});
  dialog.querySelector('input').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    const ticket=++version;save.disabled=true;status.textContent='사진을 준비하고 있어요…';let bitmap;
    try{
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024||!file.size)throw new Error('5MB 이하의 JPG, PNG, WebP 사진을 선택해주세요.');
      bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000)throw new Error('사진 해상도가 너무 커요. 4,000만 화소 이하의 사진을 선택해주세요.');
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이 브라우저에서 사진을 처리하지 못했어요.');
      ctx.fillStyle='#f3f5f8';ctx.fillRect(0,0,256,256);const side=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,256,256);const result=canvas.toDataURL('image/jpeg',.82);if(!validPhoto(result))throw new Error('사진을 줄이지 못했어요. 다른 사진을 선택해주세요.');
      if(ticket!==version||!dialog.open)return;draft=result;show();status.textContent='미리보기를 확인하고 사진 저장을 눌러주세요.';
    }catch(error){if(ticket===version&&dialog.open){status.textContent=error.message||'사진을 읽지 못했어요. 다른 사진을 선택해주세요.';save.disabled=true;}}finally{bitmap?.close();}
  };
  save.onclick=()=>{
    try{
      const current=localStorage.getItem(photoKey);if(current!==baseline){baseline=current;status.textContent='다른 탭에서 사진이 변경됐어요. 현재 미리보기로 바꾸려면 사진 저장을 다시 눌러주세요.';return;}
      if(draft)localStorage.setItem(photoKey,draft);else localStorage.removeItem(photoKey);
      profilePhoto=draft;photoReadError=false;render();dialog.close();const message=document.querySelector('#profile-message');if(message)message.textContent='프로필 사진을 이 브라우저의 스튜디오에 저장했어요.';
    }catch{status.textContent='사진을 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인한 뒤 다시 시도해주세요.';}
  };
}
addEventListener('storage',event=>{
  if(event.storageArea!==localStorage)return;
  if(event.key===photoKey||event.key===null){const value=event.newValue||'';if(value&&!validPhoto(value))return;profilePhoto=value;render();}
  if(event.key===capturePlanKey||event.key===null){capturePlanPersistent=true;capturePlanError='';capturePlan=readCapturePlan();render();}
});

function reviewTime(value){const parsed=new Date(value);return value&&!Number.isNaN(parsed.valueOf())?new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(parsed):'기록된 시간 없음';}
function reviewLabel(status){return ['submitted','reviewing','approved','rejected'].includes(status)?reviewStatusLabel(status):'상태 확인 필요';}
function renderStudioReviews(container){
  reviewObserver?.disconnect();renderReviews(container,state.service,state.clips);
  const decorate=()=>{
    if(!container.querySelector('[data-review-guide]')){const panel=document.createElement('section');panel.className='review-journey-intro';panel.dataset.reviewGuide='';panel.innerHTML=`<div><span class="account-kicker">한눈에 보는 진행 단계</span><h2>내 기록은 지금 어디쯤일까요?</h2><p>접수부터 결과, 시연 보상까지. 단계를 눌러 확인해요.</p></div><button class="button" data-action="review-progress">심사 단계 안내 ${icon('arrow',17)}</button>`;container.prepend(panel);}
    for(const card of container.querySelectorAll('[data-review-clip]')){
      if(card.querySelector('.review-progress-links'))continue;
      const entries=state.service.submissions.filter(row=>row.clipId===card.dataset.reviewClip);if(!entries.length)continue;
      const links=document.createElement('div');links.className='review-progress-links';links.innerHTML=entries.map(row=>`<button class="button" data-action="review-progress" data-id="${esc(row.id)}">${esc(row.attempt)}차 심사 단계 확인 ${icon('arrow',15)}</button>`).join('');card.append(links);
    }
    const orphan=state.service.submissions.filter(row=>!state.clips.some(clip=>clip.id===row.clipId&&!clip.example));
    if(orphan.length&&!container.querySelector('.review-retained')){const section=document.createElement('section');section.className='review-retained';section.innerHTML=`<h3>영상 삭제 후 보관된 심사 이력</h3>${orphan.map(row=>`<button class="button" data-action="review-progress" data-id="${esc(row.id)}">${esc(row.title)} · ${esc(row.attempt)}차</button>`).join('')}`;container.append(section);}
  };
  decorate();reviewObserver=new MutationObserver(decorate);reviewObserver.observe(container,{childList:true,subtree:true});
}
function openReviewProgress(id){
  if(reviewDialog)return;
  const dialog=studioDialog('review-progress-dialog','심사 진행 단계','<div id="review-progress-body"></div><p class="review-live" role="status" aria-live="polite"></p>');
  reviewDialog={dialog,id,stage:null,signature:null};dialog.addEventListener('close',()=>{reviewDialog=null;},{once:true});
  dialog.addEventListener('click',event=>{const button=event.target.closest('[data-review-stage]');if(!button)return;reviewDialog.stage=Number(button.dataset.reviewStage);updateReviewDialog(true);dialog.querySelector(`[data-review-stage="${reviewDialog.stage}"]`).focus();});
  dialog.addEventListener('change',event=>{if(event.target.id!=='review-attempt')return;reviewDialog.id=event.target.value;reviewDialog.stage=null;updateReviewDialog(true);dialog.querySelector('#review-attempt').focus();});
  updateReviewDialog();
}
function updateReviewDialog(force=false){
  if(!reviewDialog||!state.service)return;
  const {dialog,id}=reviewDialog,row=state.service.submissions.find(item=>item.id===id),credit=row&&state.service.ledger.find(item=>item.operationKey===`review:${row.id}`&&item.type==='reward'),history=row?state.service.submissions.filter(item=>item.clipId===row.clipId):[];
  const signature=JSON.stringify([row,credit,history,state.error]);if(!force&&reviewDialog.signature===signature)return;
  const changed=reviewDialog.signature!==null&&reviewDialog.signature!==signature;reviewDialog.signature=signature;
  const known=row&&['submitted','reviewing','approved','rejected'].includes(row.status),current=!known?-1:credit&&row.status==='approved'?3:['approved','rejected'].includes(row.status)?2:row.status==='reviewing'?1:0;
  const selected=reviewDialog.stage??Math.max(0,current);
  const labels=['제출 접수','내용 검토','심사 결과','시연 보상'];
  const descriptions=['제출한 영상과 미션 정보를 접수해요. 제출한 날짜와 심사 차수를 확인할 수 있어요.','촬영 가이드와 영상 내용을 검토해요. 현재 시연에서는 운영자 도구로 상태를 변경하며 자동으로 진행되지 않아요.','통과 또는 반려 결과를 확인해요. 반려되면 사유를 확인하고 다시 심사를 요청할 수 있어요.','통과 후 보상 원장에 기록된 시연 적립을 확인해요. 실제 수익이나 송금이 아니에요.'];
  const details=[row?`접수: ${reviewTime(row.createdAt)}`:'영상을 제출하면 접수 내역이 여기에 표시돼요.',row?.status==='submitted'?'아직 검토 전이에요.':known&&current>=1?'현재 상태는 저장된 심사 결과를 따릅니다. 검토 시작 시각은 별도로 기록되지 않아요.':'저장된 검토 내역이 없어요.',row&&['approved','rejected'].includes(row.status)?`${reviewLabel(row.status)} · ${reviewTime(row.reviewedAt)}`:'아직 심사 결과가 없어요.',credit?`${formatMoney(credit.amount)} · ${reviewTime(credit.createdAt)}`:row?.status==='rejected'?'반려된 제출에는 보상이 적립되지 않아요.':'아직 기록된 보상 적립이 없어요.'];
  const focused=dialog.contains(document.activeElement)?document.activeElement:null,focusStage=focused?.dataset.reviewStage,focusSelect=focused?.id==='review-attempt';
  dialog.querySelector('#review-progress-body').innerHTML=`<p class="detail-intro">이 브라우저에 저장된 로컬 심사 시연이에요. 예상 완료 시간이나 실제 심사 진행률을 의미하지 않아요.</p>${state.error?'<p class="review-caution">최신 상태를 불러오지 못했어요. 마지막으로 확인된 내역입니다.</p>':''}${id&&!row?'<p class="review-caution">이 심사 기록을 찾을 수 없어요. 아래는 일반 단계 안내입니다.</p>':''}${row?`<div class="review-current"><span class="review-badge ${known?esc(row.status):''}">${reviewLabel(row.status)}</span><h3>${esc(row.title)}</h3><p>${esc(row.attempt)}차 제출 · ${reviewTime(row.createdAt)}</p></div>${!known?'<p class="review-caution">알 수 없는 상태입니다. 완료 여부를 판단할 수 없어요.</p>':''}${history.length>1?`<label class="review-attempt-label">제출 이력<select id="review-attempt">${history.map(item=>`<option value="${esc(item.id)}" ${item.id===id?'selected':''}>${esc(item.attempt)}차 · ${reviewLabel(item.status)}</option>`).join('')}</select></label>`:''}`:'<div class="review-current"><h3>첫 제출 전, 흐름을 살펴보세요</h3><p>각 단계를 선택하면 자세한 안내가 열려요.</p></div>'}<ol class="review-stage-track">${labels.map((label,index)=>`<li class="${known&&index===current?'is-current':''} ${known&&index<current?'is-complete':''} ${row?.status==='rejected'&&index===2?'is-rejected':''}"><button data-review-stage="${index}" aria-pressed="${index===selected}" ${known&&index===current?'aria-current="step"':''}><span>${known&&index<current?'✓':String(index+1).padStart(2,'0')}</span><strong>${label}</strong><small>${!row?'안내':!known?'확인 필요':index===current?row.status==='rejected'?'반려':index===3?'적립 확인':'현재 단계':index<current?'확인됨':row.status==='rejected'?'진행 안 됨':'대기'}</small></button></li>`).join('')}</ol><section class="review-stage-detail" aria-labelledby="review-stage-heading"><span class="account-kicker">STEP ${String(selected+1).padStart(2,'0')}</span><h3 id="review-stage-heading">${labels[selected]}</h3><p>${descriptions[selected]}</p><div class="review-recorded">${esc(details[selected])}</div>${selected===2&&row?.reason?`<div class="review-reason"><strong>${row.status==='rejected'?'반려 사유':'심사 메모'}</strong><p>${esc(row.reason)}</p>${row.status==='rejected'?'<small>내용을 확인한 뒤 심사 현황에서 다시 요청할 수 있어요. 이전 결과는 이력에 남아요.</small>':''}</div>`:''}</section>`;
  if(focusStage!==undefined)dialog.querySelector(`[data-review-stage="${focusStage}"]`)?.focus();else if(focusSelect)dialog.querySelector('#review-attempt')?.focus();
  if(changed)dialog.querySelector('.review-live').textContent='저장된 심사 상태를 새로 반영했어요.';
}
