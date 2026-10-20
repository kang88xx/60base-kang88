import { canExchange, couponTestHistory, openCouponExchange } from './coupon-rewards.js';
import { isNativeApp, getNativeAppInfo } from './native.js';
import { openAccountDeletion, hasDeletionReceipt, openDeletionReceipt } from './account-deletion.js';
import { activities, categories, examples, exampleFor, activityFor } from './catalog.js';
import { getAppState, subscribeApp, refreshApp, appReady, login, logout, manageAccount, record, importVideo, submitClip, viewSubmission, resubmitSubmission, mountSupport, requireFreshAppSession } from './service.js';
import { dialog, esc, points, money, date, size } from '../studio/online-api.js';
import { initializeInstall, requestInstall, getInstallState, applyAppUpdate } from './install.js';
import { getPreparationState, subscribePreparation, toggleSavedActivity, selectPreparationActivity, renderEducation, handlePreparationClick, handlePreparationChange, setPublishedActivities, preparationActivityError } from './preparation.js';
import { openDeviceSettings, getDevicePhoto } from './device-settings.js';
import { updateLaunch } from './launch.js';
import { canEnterApp } from './access-boundary.js';
import { brandLockup, welcomeScreen, homeScreen, rankingScreen, profileScreen } from './experience-ui.js';
import { getCommunity, subscribeCommunity, refreshCommunity } from './community.js';
import { showAccountEntry } from '../studio/online.js';
import { getReferrals, subscribeReferrals, refreshReferrals, setReferralDraft, claimReferral, shareReferral, referralCard } from './referrals.js';
import { initializeWelcomePopup } from './welcome-popup.js';
import { VIDEO_TARGET_SECONDS } from '../shared/video-policy.js';

const main=document.querySelector('#app-main'), header=document.querySelector('#app-header'), shell=document.querySelector('.app-shell'), nav=document.querySelector('.app-bottom-nav');
const ui={category:'전체',query:'',savedOnly:false,examplesOnly:false,reviewFilter:'all',reviewQuery:'',feature:0,estimateCount:3,estimateActivity:'dishwashing'};
const titles={home:'홈',ranking:'함께 쌓아가는 기록',missions:'촬영 활동',activity:'활동 안내',guide:'촬영 가이드',education:'촬영 교육·점검',estimate:'포인트 계산',announcements:'공지사항',library:'보관한 영상',reviews:'제출·심사',wallet:'내 보상',profile:'프로필',settings:'설정',support:'문의·도움'};
let toastTimer,renderQueued=false,preparationCatalog;
const pendingActions=new Map();
const markupCache=new WeakMap();
let renderedRoute='',renderedAccount='',educationRoute='',supportAccount='',composing=false;
const actionMessages={login:'계정 연결을 확인하고 있어요.',logout:'로그아웃하고 있어요.',account:'계정 정보를 불러오고 있어요.', 'device-settings':'기기 설정을 불러오고 있어요.',record:'카메라를 준비하고 있어요.',import:'영상 가져오기를 준비하고 있어요.','open-clip':'영상을 열고 있어요.','submit-clip':'제출 화면을 준비하고 있어요.','submit-video':'제출 화면을 준비하고 있어요.','view-submission':'영상 내역을 불러오고 있어요.',resubmit:'재검토 화면을 준비하고 있어요.',refresh:'최신 내역을 확인하고 있어요.',install:'설치를 준비하고 있어요.'};
function setMarkup(element,markup){
 if(markupCache.get(element)===markup)return false;
 element.innerHTML=markup;markupCache.set(element,markup);return true;
}
function loadingScreen(title='불러오고 있어요.',copy='잠시만 기다려주세요.'){
 return `<section class="app-loading" role="status" aria-live="polite"><img class="app-loading-symbol" src="./icons/mascot-purple-3d-20261019.png" alt="" width="112" height="112"><h2>${esc(title)}</h2><p>${esc(copy)}</p></section>`;
}
function updateProgress(){
 const state=getAppState(),current=route(),node=document.querySelector('#app-progress');
 if(!node)return;
 const action=Array.from(pendingActions.values()).at(-1);
 const needsAccount=state.access==='checking'||state.accountConnecting;
 const message=action?.message||(needsAccount?'계정을 확인하고 있어요.':state.loading?(['profile','wallet','reviews','library'].includes(current.name)?'내역을 불러오고 있어요.':'최신 활동을 확인하고 있어요.'):'');
 const cameraOpen=Boolean(document.querySelector('.studio-camera-dialog[open]'));
 node.hidden=!canEnterApp(state)||!message||cameraOpen||Boolean(main.querySelector('.app-loading'));
 node.querySelector('[data-progress-message]').textContent=message;
 for(const button of document.querySelectorAll('[data-app-action]')){
  const key=button.dataset.appAction+':'+(button.dataset.id||'');
  const busy=pendingActions.has(key);
  if(busy){button.disabled=true;button.setAttribute('aria-busy','true');button.dataset.appBusy='true';}
  else if(button.dataset.appBusy){button.disabled=false;button.removeAttribute('aria-busy');delete button.dataset.appBusy;}
 }
}

const guardedActions=new Set(['share-app','share-referral','copy-referral','refresh-referrals','refresh-community','login','logout','account','device-settings','record','import','open-clip','submit-clip','submit-video','view-submission','resubmit','refresh','install','update-app']);
function focusSelector(node){
 if(!node||!shell.contains(node))return '';
 if(node.id)return '#'+CSS.escape(node.id);
 for(const key of ['data-category','data-review-filter','data-tab','data-prep-check'])if(node.hasAttribute(key))return `[${key}="${CSS.escape(node.getAttribute(key))}"]`;
 if(node.hasAttribute('data-prep-action'))return '[data-prep-action="'+CSS.escape(node.dataset.prepAction)+'"]'+['id','example','question','answer'].filter(key=>node.dataset['prep'+key[0].toUpperCase()+key.slice(1)]).map(key=>'[data-prep-'+key+'="'+CSS.escape(node.getAttribute('data-prep-'+key))+'"]').join('');
 if(node.hasAttribute('data-app-action'))return '[data-app-action="'+CSS.escape(node.dataset.appAction)+'"]'+['id','index','example'].filter(key=>node.dataset[key]).map(key=>'[data-'+key+'="'+CSS.escape(node.dataset[key])+'"]').join('');
 return '';
}
const icon=name=>`<span class="app-icon" style="--icon:url('./icons/phosphor/${name}.svg')" aria-hidden="true"></span>`;
const pointPill=(amount,extra='')=>`<span class="point-pill ${extra}"><span class="point-value">${typeof amount==='number'?new Intl.NumberFormat('ko-KR').format(amount):esc(amount)}</span><small class="point-unit">P</small></span>`;
const initial=name=>Array.from(name||'참여자')[0];
const stamp=value=>{try{return new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric'}).format(new Date(value));}catch{return '날짜 확인 중';}};
const duration=value=>Number.isFinite(value)?`${Math.floor(value/60)}분 ${Math.floor(value%60)}초`:'길이 확인 중';
const statusNames={uploaded:'제출 전',submitted:'접수 완료',reviewing:'검토 중',approved:'승인',rejected:'보완 필요',deleted:'삭제됨',deleting:'삭제 처리 중'};
function route(){
 const [path,query='']=location.hash.slice(1).split('?'),[name,id,step]=path.split('/');
 const resolved=name==='library'?'reviews':Object.hasOwn(titles,name)?name:name==='capture'?'guide':name==='shop'?'wallet':'home';
 const returnTo=['library','education','estimate','announcements','support'].includes(resolved)&&new URLSearchParams(query).get('from')==='settings'?'settings':'';
 return {name:resolved,id,step:Math.max(1,Math.min(3,Math.trunc(Number(step))||1)),returnTo};
}
function tasks(){const catalog=getAppState().catalog;return catalog?.tasks?.map(task=>({...activityFor(task.id),...task,description:activityFor(task.id)?.description||String(task.instructions||'').split(/\r?\n/)[0],actions:activityFor(task.id)?.actions||[],tips:activityFor(task.id)?.tips||[]}))||activities.map(item=>({...item,reward:null}));}
function selectedTask(id){return tasks().find(item=>item.id===id)||tasks()[0]||{...activities[0],reward:null};}
function reward(task){return task.reward!==null&&task.reward!==undefined&&Number.isFinite(Number(task.reward))?Number(task.reward):null;}
function rewardPill(task,extra=''){return reward(task)===null?'<span class="reward-unavailable">연결 후 확인</span>':pointPill(reward(task),extra);}
function empty(title,copy,action=''){return `<section class="app-empty"><span class="empty-icon">${icon('video-camera')}</span><h2>${esc(title)}</h2><p>${esc(copy)}</p>${action}</section>`;}
function button(label,action,extra='',kind='primary'){return `<button type="button" class="app-button ${kind}" data-app-action="${action}" ${extra}>${label}</button>`;}
function backHref(current){if(current.returnTo==='settings')return '#settings';if(current.name==='education')return tasks().some(item=>encodeURIComponent(item.id)===current.id)?(current.step===3?`#guide/${current.id}/3`:`#activity/${current.id}`):'#missions';if(['activity','estimate'].includes(current.name))return '#missions';if(current.name==='guide')return current.step>1?`#guide/${current.id||tasks()[0]?.id}/${current.step-1}`:current.id?`#activity/${current.id}`:'#home';if(['settings','library','reviews','support'].includes(current.name))return '#profile';return '#home';}
function renderHeader(current,state){
 if(current.name==='home')setMarkup(header,`<a class="app-brand" href="#home" aria-label="에고 홈">${brandLockup()}</a>${state.access==='allowed'?`<a href="#wallet" class="header-points" aria-label="내 포인트 ${state.me?points(state.me.wallet.available):'확인'}">${pointPill(state.me?state.me.wallet.available:'—','compact')}</a>`:`<button type="button" class="header-signin" data-app-action="login">회원가입 / 로그인 ${icon('arrow-right')}</button>`}`);
 else setMarkup(header,`<a class="app-back" href="${backHref(current)}" aria-label="이전 화면">${icon('arrow-left')}</a><span class="header-title">${esc(titles[current.name])}</span>${current.name==='profile'?`<a class="app-back" href="#settings" aria-label="설정">${icon('gear')}</a>`:current.name==='library'?`<button type="button" class="app-back" data-app-action="import" aria-label="영상 가져오기">${icon('plus')}</button>`:'<span class="header-spacer"></span>'}`);
}
function renderNav(current){
 const active=['missions','activity','guide','education','estimate'].includes(current.name)?'missions':['library','reviews','settings','support','announcements'].includes(current.name)?'profile':current.name==='ranking'?'wallet':current.name;
 if(!nav.querySelector('[data-tab]'))setMarkup(nav,[['home','house','홈'],['missions','camera','촬영'],['wallet','wallet','보상'],['profile','user','프로필']].map(([id,image,label])=>`<a href="#${id}" data-tab="${id}" aria-label="${label}">${icon(image)}<span>${label}</span></a>`).join(''));
 for(const link of nav.querySelectorAll('[data-tab]')){if(link.dataset.tab===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 nav.hidden=['activity','guide'].includes(current.name);
}
function categoryRail(home=false){return `<div class="category-rail ${home?'on-blue':''}" role="group" aria-label="촬영 활동 분류">${categories.map(item=>`<button type="button" data-category="${esc(item.name)}" ${home?'data-home-category':''} aria-pressed="${ui.category===item.name}"><span>${esc(item.label||item.name)}</span></button>`).join('')}</div>`;}
function taskMedia(task,{hero=false}={}){const example=exampleFor(task);return example?`<div class="task-media"><img src="${example.poster}" width="640" height="360" ${hero?'':'loading="lazy"'} alt="${esc(example.label)} 촬영 예시"><span class="media-label">실제 촬영 예시</span></div>`:`<div class="task-icon-media">${icon(categories.find(item=>item.name===task.category)?.icon||'camera')}<span>${esc(task.category)}</span></div>`;}
function home(state){return homeScreen(state,{tasks,activityCard,categoryRail,icon,ui});}

function activityCard(task,{featured=false,homeRow=false}={}){const saved=!featured&&getPreparationState().plan.saved.includes(task.id);return `<article class="task-with-save ego-choice-card ${featured?'alan-featured-card':''} ${homeRow?'ego-mission-row':''}"><a class="task-card c01-link" href="#activity/${encodeURIComponent(task.id)}">${taskMedia(task,{hero:featured})}<div class="task-card-copy"><span class="c01-meta">${esc(task.category)} · 촬영 1분</span><h2>${esc(task.title)}</h2><div class="c01-reward"><small>최종 심사 승인 시</small>${rewardPill(task,'small')}</div></div></a>${featured?'':`<button id="save-${homeRow?'home':'missions'}-${esc(task.id)}" class="task-save" type="button" data-app-action="save-activity" data-id="${esc(task.id)}" aria-pressed="${saved}" aria-label="${esc(task.title)} ${saved?'저장 취소':'저장'}">${icon(saved?'check':'plus')}</button>`}</article>`;}
function preparationNotice(){const {notice}=getPreparationState();return notice?`<p class="app-alert" role="status">${esc(notice)}</p>`:'';}
function missions(){
 const {plan}=getPreparationState();
 const list=tasks().filter(task=>(ui.category==='전체'||task.category===ui.category)&&(!ui.savedOnly||plan.saved.includes(task.id))&&(!ui.examplesOnly||exampleFor(task))&&`${task.title} ${task.description} ${task.category}`.toLowerCase().includes(ui.query.trim().toLowerCase()));
 return `<div class="screen-heading"><h1>익숙한 일상부터<br>시작해보세요.</h1><p>마음에 드는 활동을 고르고, 1분을 담아요.</p></div><label class="app-search">${icon('magnifying-glass')}<input id="app-search" type="search" value="${esc(ui.query)}" placeholder="어떤 활동을 찾으세요?" aria-label="촬영 활동 검색"></label>${categoryRail()}<div class="review-filters" role="group" aria-label="활동 보기"><button type="button" data-app-action="saved-filter" aria-pressed="${ui.savedOnly}">저장한 활동 · ${plan.saved.length}</button><button type="button" data-app-action="examples-filter" aria-pressed="${ui.examplesOnly}">예시 영상 있음</button></div>${preparationNotice()}<div class="section-row result-count"><p role="status">${list.length}개의 촬영 활동</p><button class="text-button" type="button" data-app-action="reset-search">초기화</button></div><div class="ego-mission-list">${list.map(task=>activityCard(task,{homeRow:true})).join('')||empty('일치하는 활동이 없어요.','검색어나 필터를 바꿔보세요.')}</div><a class="app-button secondary" href="#education">촬영 교육·점검</a>`;
}
function unavailableActivity(){const state=getAppState();return !state.catalog?empty('활동 정보를 확인하지 못했어요.','인터넷 연결을 확인한 뒤 다시 불러와주세요.',button('다시 불러오기','refresh')):empty('현재 공개되지 않은 활동이에요.','공개가 종료되었거나 활동 정보를 찾지 못했어요. 현재 목록에서 다시 골라주세요.','<a class="app-button primary" href="#missions">활동 목록 보기</a>');}
function activity(current,state){const task=tasks().find(item=>item.id===current.id);if(!task)return unavailableActivity();const example=exampleFor(task);return `<section class="activity-intro"><div class="screen-heading"><span class="step-chip">${icon('video-camera')} 영상</span><h1>${esc(task.title)}</h1></div><div class="activity-stats"><article><span class="row-icon cyan">${icon('clock')}</span><strong>1분</strong><small>베타 촬영 길이</small></article><article><span class="row-icon cyan">${icon('wallet')}</span><strong>${reward(task)===null?'연결 후 확인':points(reward(task))}</strong><small>검수 승인 후 적립</small></article></div><p class="activity-summary">${esc((task.instructions||task.description).replace(/약\s*5분/g,'1분'))}</p>${example?`<section class="detail-section"><h2>이렇게 촬영해요</h2><button type="button" class="detail-sample" data-app-action="sample" data-example="${esc(example.id)}">${taskMedia(task)}<span class="sample-play">${icon('play')} 실제 촬영 예시 보기</span></button></section>`:'<p class="muted-caption">이 활동의 예시 영상은 준비 중이에요. 아래 활동 안내와 촬영 기준을 확인해주세요.</p>'}${task.actions.length?`<section class="detail-section"><h2>촬영할 활동</h2><ol class="activity-steps">${task.actions.map((action,index)=>`<li><span>${index+1}</span>${esc(action)}</li>`).join('')}</ol></section>`:''}<section class="detail-section"><h2>촬영 전에 확인해주세요</h2><ul class="check-list activity-checklist">${['한국 내 생활공간에서 직접 촬영해요.','카메라를 안정적으로 고정하고, 가로 방향으로 내 시점에서 촬영해요.','양손과 작업 대상 전체가 화면에 함께 보이게 해요.','얼굴·주소·개인 문서와 사적인 대화가 포함되지 않게 해요.',...task.tips,'편집하거나 속도를 바꾸지 않고 평소의 자연스러운 동작을 담아요.'].map(copy=>`<li>${icon('check-circle')}<span>${esc(copy)}</span></li>`).join('')}</ul></section></section><div class="screen-footer filming-footer"><a class="app-button primary" href="#guide/${encodeURIComponent(task.id)}/1">다음</a><p>촬영하거나 가져온 영상은 이용 범위와 동의를 확인한 뒤 바로 제출합니다.</p></div>`;}
const guideSteps=[
 {title:'1인칭 시점을 유지하고\n가로로 촬영해주세요.',body:'카메라를 내 시선과 맞추고 안정적으로 고정해주세요. 영상은 반드시 가로 방향으로 촬영해요.',label:'촬영 방법'},
 {title:'양손이 보이게,\n대상 전체가 담기게 찍으세요.',body:'손동작과 작업 대상이 함께 보여야 해요. 양손은 화면 아래쪽에, 작업 대상은 프레임 안에 들어오도록 맞춰주세요.',label:'촬영 방법'},
 {title:'밝고 선명하게\n촬영하세요.',body:'베타 테스트에서는 1분 촬영 후 자동 종료돼요. 평소의 자연스러운 속도로 촬영해주세요.',label:'촬영 방법'},
];
function guide(current){const task=current.id?tasks().find(item=>item.id===current.id):tasks()[0];if(!task)return unavailableActivity();const step=current.step,data=guideSteps[step-1],example=exampleFor(task),frame='../assets/images/ego-filming-frame-20261019.png';return `<section class="filming-guide"><div class="guide-progress"><span class="step-chip">3단계 중 ${step}단계</span><div class="step-dots" aria-label="${step}/3단계">${[1,2,3].map(value=>`<a href="#guide/${encodeURIComponent(task.id)}/${value}" aria-label="${value}단계" ${step===value?'aria-current="step"':''}></a>`).join('')}</div></div><div class="screen-heading guide-heading"><span class="blue-label">${data.label}</span><h1>${data.title.replace('\n','<br>')}</h1></div>${step===1?`${example?`<figure class="guide-visual"><img src="${example.poster}" width="640" height="360" alt="${esc(example.label)} 실제 촬영 구도"><figcaption>실제 촬영 예시 · ${esc(example.label)}</figcaption></figure>`:'<p class="muted-caption">이 활동의 예시 영상이 아직 준비되지 않았어요. 다음 단계에서 촬영 구도를 확인해주세요.</p>'}<p class="guide-explanation">${data.body}</p>${example?`<button type="button" class="settings-row sample-row" data-app-action="sample" data-example="${esc(example.id)}"><span class="row-icon navy">${icon('play')}</span><span><strong>샘플 영상 보기</strong><small>실제 손동작과 촬영 구도를 확인해요.</small></span>${icon('caret-right')}</button>`:''}`:step===2?`<figure class="guide-visual guide-frame-hero"><div class="guide-frame-diagram"><img src="${frame}" width="1665" height="944" alt="양손이 화면 아래쪽에 보이고 작업 대상 전체가 중앙에 들어오는 촬영 구도"></div><figcaption>내 프레임 · 양손과 작업 대상이 함께 보이게</figcaption></figure><p class="guide-explanation">${data.body}</p><div class="framing-comparison"><figure class="frame-bad"><div><img src="${frame}" width="1665" height="944" alt="작업 대상이 화면 밖으로 잘린 잘못된 구도"><span>${icon('x')}</span></div><figcaption>대상이 잘리면 안 돼요</figcaption></figure><figure class="frame-good"><div><img src="${frame}" width="1665" height="944" alt="작업 대상 전체와 양손이 담긴 올바른 구도"><span>${icon('check-circle')}</span></div><figcaption>대상 전체를 담아요</figcaption></figure></div><p class="guide-explanation">작업 대상이 항상 프레임 안에 들어오게 하고, 몸이나 다른 물건으로 화면을 가리지 마세요.</p>`:`<div class="quality-comparison"><section class="quality-bad"><span>${icon('x')}</span><h2>이런 영상은 보완이 필요해요</h2><ul><li>작업 과정이 너무 짧아요</li><li>화면이 흔들려요</li><li>너무 어두워 잘 안 보여요</li><li>속도를 바꾸거나 편집했어요</li></ul></section><section class="quality-good"><span>${icon('check-circle')}</span><h2>이렇게 촬영해주세요</h2><ul><li>활동 과정을 충분히 담아요</li><li>자연스러운 작업 속도</li><li>밝고 선명한 영상</li><li>안정적인 가로 화면</li></ul></section></div><p class="guide-explanation">${data.body}</p><a class="guide-education-link" href="#education/${encodeURIComponent(task.id)}/3" data-app-action="prepare-activity" data-id="${esc(task.id)}" data-return-step="3">교육 확인 문제·촬영 전 점검 ${icon('caret-right')}</a>`}</section><div class="screen-footer filming-footer">${step<3?`<a class="app-button primary" href="#guide/${encodeURIComponent(task.id)}/${step+1}">다음</a>`:`${button(`${icon('upload-simple')} 영상 가져오기`,'import',`data-id="${esc(task.id)}"`,'secondary')}${button(`${icon('camera')} 영상 촬영`,'record',`data-id="${esc(task.id)}"`)}`}<p>촬영하거나 가져온 영상은 이용 동의를 확인한 뒤 바로 제출합니다.</p></div>`;}
function gate(state){return welcomeScreen(state,{icon,receiptAvailable:hasDeletionReceipt()});}

function loadingPrivate(state){if(state.loading&&!state.me)return loadingScreen('내역을 불러오고 있어요.','심사 결과와 포인트를 확인하고 있어요.');if(!state.online)return empty('연결이 필요해요.','심사 결과와 포인트는 인터넷에 연결한 뒤 확인할 수 있어요.',button('다시 연결하기','refresh'));if(state.error||!state.me)return empty('내역을 불러오지 못했어요.',state.error||'다시 연결해 확인해주세요.',button('다시 불러오기','refresh'));return '';}
function filterVideos(videos){return videos.filter(video=>(ui.reviewFilter==='all'||(ui.reviewFilter==='pending'?['submitted','reviewing'].includes(video.status):video.status===ui.reviewFilter))&&video.title.toLowerCase().includes(ui.reviewQuery.trim().toLowerCase()));}
function reviewList(videos,{compact=false}={}){return `<div class="submission-list">${(compact?videos:filterVideos(videos)).map(video=>`<article class="submission-card"><div class="submission-summary"><span class="submission-icon">${icon('video-camera')}</span><div><span class="status-pill ${esc(video.status)}">${esc(statusNames[video.status]||video.status)}</span><h3>${esc(video.title)}</h3><p>${stamp(video.submittedAt||video.createdAt)} · ${duration(video.duration)}</p></div></div>${!['deleted','deleting'].includes(video.status)?`<div class="submission-points ${video.status==='approved'?'is-approved':'is-pending'}"><small>${video.status==='approved'?'승인 포인트':'승인 시 예상 포인트'}</small><strong>${points(video.reward)}</strong></div>`:''}${video.reason?`<p class="review-reason">${esc(video.reason)}</p>`:''}<div class="submission-actions">${button('영상·상세','view-submission',`data-id="${esc(video.id)}"`,'secondary')}${['uploaded','rejected'].includes(video.status)?button(video.status==='uploaded'?'동의하고 제출':'같은 영상 재검토','resubmit',`data-id="${esc(video.id)}"`):''}${video.status==='rejected'?button('수정 영상 제출','submit-video','','secondary'):''}</div></article>`).join('')||empty(videos.length?'해당 상태의 영상이 없어요.':'아직 제출한 영상이 없어요.',videos.length?'다른 상태를 선택해보세요.':'촬영하거나 가져온 영상을 동의 후 제출해주세요.',videos.length?button('전체 내역 보기','reset-reviews'):'<a class="app-button primary" href="#missions">촬영 활동 고르기</a>')}</div>`;}
function reviewFilters(){return `<div class="review-filters" role="group" aria-label="심사 상태">${[['all','전체'],['pending','검토 중'],['approved','승인'],['rejected','보완 필요'],['uploaded','제출 전'],['deleting','삭제 처리 중'],['deleted','삭제됨']].map(([id,label])=>`<button type="button" data-review-filter="${id}" aria-pressed="${ui.reviewFilter===id}">${label}</button>`).join('')}</div>`;}
function reviews(state){const issue=loadingPrivate(state);return `<div class="screen-heading"><h1>제출부터 승인까지</h1><p>실제 심사 상태를 확인해요.<br>포인트는 영상이 승인된 뒤 적립됩니다.</p></div>${issue||`<ol class="app-review-steps" aria-label="심사 진행 순서"><li>영상 제출</li><li>기준 확인</li><li>승인·보완</li><li>포인트 적립</li></ol><div class="action-pair">${button('영상 파일 제출','submit-video')}<a class="app-button secondary" href="#missions">영상 촬영</a></div><label class="app-search">${icon('magnifying-glass')}<input id="app-review-search" type="search" value="${esc(ui.reviewQuery)}" placeholder="제출한 영상 제목 검색" aria-label="제출한 영상 검색"></label><div class="section-row"><span class="muted-caption">제출한 영상은 영상·상세에서 다시 볼 수 있어요.</span><button type="button" class="round-button" data-app-action="refresh" aria-label="심사 내역 새로고침">${icon('arrow-clockwise')}</button></div>${reviewFilters()}${reviewList(state.me.videos)}`}`;}
function wallet(state){
 const issue=loadingPrivate(state);if(issue)return issue;
 const me=state.me,pending=me.videos.filter(video=>['submitted','reviewing'].includes(video.status)),pendingPoints=pending.reduce((total,video)=>total+(Number(video.reward)||0),0),eligible=canExchange(me.wallet.available),history=couponTestHistory(state.user.id);
 const ledger=entries=>entries.map(entry=>`<article><div><h3>${esc({reward:'영상 승인',referral:'친구 초대',purchase:'포인트 사용',refund:'사용 취소 반환'}[entry.kind]||'포인트 조정')}</h3><small>${stamp(entry.createdAt)}</small></div><strong>${entry.amount>0?'+':''}${points(entry.amount)}</strong></article>`).join('');
 return `<div class="screen-heading"><h1>일상의 가치를 모아요</h1></div><div class="reward-dashboard"><section class="reward-balance"><span>보유 포인트</span><strong data-points-balance>${new Intl.NumberFormat('ko-KR').format(me.wallet.available)}<small>P</small></strong><p>30,000P부터 상품권·커피 쿠폰으로 교환</p><img class="alan-reward-mascot" src="icons/mascot-purple-3d-20261019.png" width="110" height="104" alt="">${button('포인트 교환하기','exchange-coupons',eligible?'':'disabled')}<p>${eligible?'원하는 쿠폰을 골라보세요.':`${points(Math.max(0,30000-me.wallet.available))} 더 모으면 교환할 수 있어요.`}</p></section><div class="reward-stats"><div><span>승인 시 예상</span><strong data-pending-points>${points(pendingPoints)}</strong><small>심사 중 ${pending.length}개 · 잔액 미포함</small></div><div><span>누적 적립</span><strong>${points(me.wallet.earned)}</strong><small>영상 승인 · 친구 초대</small></div></div><details class="reward-history"><summary>포인트 내역<small>최근 ${Math.min(3,me.ledger.length)}건</small></summary><div class="ledger-list">${me.ledger.length?ledger(me.ledger.slice(0,3)):'<p class="reward-empty">영상이 승인되면 여기에 표시돼요.</p>'}</div>${me.ledger.length>3?`<details><summary>전체 ${me.ledger.length}건 보기</summary><div class="ledger-list">${ledger(me.ledger.slice(3))}</div></details>`:''}</details><details class="reward-history"><summary>테스트 교환 내역<small>${history.length}건</small></summary><p class="reward-empty">테스트 기록만 저장됩니다. 실제 포인트 차감·쿠폰 발급은 없어요.</p><div class="ledger-list">${history.map(item=>`<article><div><h3>${esc(item.name)}</h3><small>${stamp(item.createdAt)} · ${esc(item.phone)} · 테스트 완료</small></div><strong>${points(item.cost)}</strong></article>`).join('')||'<p class="reward-empty">아직 교환한 쿠폰이 없어요.</p>'}</div></details>${me.payouts?.length?`<details class="reward-history"><summary>이전 지급 기록</summary><div class="ledger-list">${me.payouts.map(item=>`<article><div><h3>${esc({pending:'처리 대기',paid:'지급 확인',rejected:'반려',cancelled:'취소'}[item.status]||item.status)}</h3><small>${stamp(item.createdAt)}</small></div><strong>${money(item.amount)}</strong></article>`).join('')}</div></details>`:''}<details class="reward-history"><summary>함께 쌓아가는 기록</summary><section class="reward-ranking" aria-label="랭크">${rankingScreen(getCommunity(),{icon,button,empty})}</section></details></div>`;
}
function rewards(state){return wallet(state);}
function row(label,detail,image,target,{action=false,tone='',end=''}={}){const tag=action?'button':'a',attr=action?`type="button" data-app-action="${target}"`:`href="${target}"`;return `<${tag} class="settings-row" ${attr}><span class="row-icon ${tone}">${icon(image)}</span><span class="row-copy"><strong>${label}</strong>${detail?`<small>${esc(detail)}</small>`:''}</span>${end?`<span class="row-value">${end}</span>`:''}${icon('caret-right')}</${tag}>`;}
function profile(state){return profileScreen(state,{icon,getDevicePhoto,reviewFilters,reviewList,loadingPrivate,points,referral:referralCard(getReferrals())});}

let nativeVersion='',nativeVersionPending;
function appVersion(){
 if(!isNativeApp())return '웹 앱';
 if(!nativeVersionPending){
  nativeVersionPending=getNativeAppInfo().then(info=>{
   nativeVersion=info?.version?info.version+(info.build?' ('+info.build+')':''):'확인할 수 없음';
  },()=>{nativeVersion='확인할 수 없음';}).finally(queueRender);
 }
 return nativeVersion||'확인 중…';
}
function settings(state){const install=getInstallState();return `<div class="settings-section"><h2>계정</h2><div class="settings-group">${state.access==='allowed'?row('내 정보 수정',state.user?.email||'이름과 로그인 계정','user','account',{action:true,tone:'lavender'}):row('로그인 / 회원가입','계정으로 시작해요','user','login',{action:true,tone:'lavender'})}${state.access==='allowed'?row('기기 촬영 설정','기록용 이름·목표·사진','gear','device-settings',{action:true,tone:'cyan'}):''}${row('상품권·쿠폰 교환','30,000P부터 교환할 수 있어요.','wallet','#wallet',{tone:'cyan'})}</div></div><div class="settings-section"><h2>촬영과 데이터</h2><div class="settings-group">${row('촬영 교육·점검','예시 영상·확인 문제·촬영 전 점검','check-circle','#education?from=settings',{tone:'mint'})}${row('예상 포인트 계산','승인될 영상 수로 계산해요','wallet','#estimate?from=settings',{tone:'peach'})}${row('촬영 가이드','활동을 고른 뒤 세 단계로 준비해요','camera','#missions',{tone:'lavender'})}${row('제출한 영상','영상과 심사 상태를 확인해요.','video-camera','#reviews',{tone:'cyan'})}${row('개인정보 안내','수집 항목·보관·삭제 요청','shield-check','../studio/privacy.html',{tone:'mint'})}</div></div><div class="settings-section"><h2>앱</h2><div class="settings-group">${install.updateAvailable?row('앱 업데이트','열린 작업을 마친 뒤 최신 버전으로 열어요.','arrow-clockwise','update-app',{action:true,tone:'mint'}):''}${row(install.installed?'홈 화면에서 사용 중':'홈 화면에 앱 설치',install.installed?'설치된 에고 앱입니다.':'빠르게 열고 촬영을 시작해요.','device-mobile','install',{action:true,tone:'peach'})}${row('문의하기','촬영·심사·계정에 대해 물어보세요.','question','#support?from=settings',{tone:'cyan'})}${row('공지사항','현재 운영 공지 확인','bell','#announcements?from=settings',{tone:'mint'})}${!isNativeApp()&&state.online&&state.user?.role==='admin'?row('관리자 콘솔','검수와 운영 관리','shield-check','/admin/',{tone:'lavender'}):''}${row('서비스 약관','','shield-check','../studio/terms.html',{tone:'lavender'})}<div class="settings-row"><span class="row-icon mint">${icon('squares-four')}</span><span class="row-copy"><strong>앱 버전</strong></span><span class="row-value">${esc(appVersion())}</span></div>${state.access==='allowed'?row('로그아웃','','sign-out','logout',{action:true,tone:'peach'}):''}</div></div>${install.error?`<p class="muted-caption" role="status">${esc(install.error)}</p>`:''}<p class="muted-caption">쿠폰 교환의 전화번호 인증은 현재 테스트 모드입니다.</p><button type="button" class="deletion-help" data-app-action="delete-account">계정과 데이터 삭제</button><p class="settings-footer"><strong>에고 EGO</strong><span>내 시점이 AI가 된다.</span><a href="https://60base.ai/">운영 · 60BASE</a></p>`;}
function support(){return '<div class="screen-heading"><h1>무엇을 도와드릴까요?</h1><p>촬영부터 제출까지, 궁금한 점을 남겨주세요.</p></div><div id="app-support"></div>';}
function announcements(state){
 const catalog=state.catalog;
 return `<div class="screen-heading"><h1>공지사항</h1><p>현재 등록된 서비스 공지를 확인해요.</p></div>${!catalog?empty('안내를 불러오지 못했어요.','인터넷 연결을 확인한 뒤 다시 시도해주세요.',button('새로고침','refresh')):`${catalog.settings?.notice?`<p class="app-alert">${esc(catalog.settings.notice)}</p>`:''}<div class="app-announcements">${catalog.announcements?.length?catalog.announcements.map(item=>`<details><summary>${esc(item.title)}</summary><p>${esc(item.body)}</p></details>`).join(''):empty('등록된 공지가 없어요.','새로운 안내가 올라오면 이곳에서 확인할 수 있어요.')}</div>`}`;
}
function estimateValue(){const count=Number(ui.estimateCount);if(!Number.isInteger(count)||count<1||count>20)return '1~20 사이의 정수를 입력해주세요.';const task=selectedTask(ui.estimateActivity),amount=reward(task);return amount===null?'연결 후 포인트를 확인할 수 있어요.':`${count}개 모두 승인 시 ${points(amount*count)} · 촬영 약 ${count*VIDEO_TARGET_SECONDS/60}분`;}
function updateEstimate(){const output=document.querySelector('#app-estimate-result');if(output)output.textContent=estimateValue();}
function estimate(){return `<div class="screen-heading"><h1>승인 시 포인트는?</h1><p>촬영할 영상 수로 미리 계산해보세요.</p></div><div class="app-estimator"><label>촬영 활동<select id="app-estimate-activity">${tasks().map(task=>`<option value="${esc(task.id)}" ${task.id===ui.estimateActivity?'selected':''}>${esc(task.title)}</option>`).join('')}</select></label><label>영상 수<input id="app-estimate-count" type="number" min="1" max="20" step="1" inputmode="numeric" value="${esc(ui.estimateCount)}"></label><output id="app-estimate-result" role="status" aria-live="polite">${estimateValue()}</output><p>최종 심사 승인 시 적립되는 예상값입니다. 계산값은 실제 보유 포인트에 반영되지 않아요. 1~20개는 계산 범위이며 참여 횟수 제한이 아닙니다.</p></div><a class="app-button primary" href="#missions">촬영 활동 고르기</a>`;}
function education(current,{activityPickerOpen=false}={}){if(current.id){const task=tasks().find(item=>encodeURIComponent(item.id)===current.id);if(!task)return unavailableActivity();if(educationRoute!==current.id){if(getPreparationState().plan.selected!==task.id&&!selectPreparationActivity(task.id))return unavailableActivity();educationRoute=current.id;}}return renderEducation({icon,esc,returnActivity:current.id,returnStep:current.step,activityPickerOpen});}
function render({navigation=false}={}){
 const current=route(),state=getAppState(),focus=document.activeElement,focusTarget=focusSelector(focus),selection=focus&&typeof focus.selectionStart==='number'?[focus.selectionStart,focus.selectionEnd]:null;
 if(preparationCatalog!==state.catalog){preparationCatalog=state.catalog;setPublishedActivities(Array.isArray(state.catalog?.tasks)?tasks():null);}
 const routeKey=current.name+':'+(current.id||'')+':'+current.step+':'+current.returnTo;
 const accountKey=state.accountKey+'|'+(state.user?.id||'')+'|'+state.access;
 const sameContext=renderedRoute===routeKey&&renderedAccount===accountKey;
 const activityPickerOpen=sameContext&&Boolean(main.querySelector('.prep-activity-picker')?.open);
 if(!sameContext){markupCache.delete(main);supportAccount='';educationRoute='';}
 if(composing&&sameContext){updateProgress();return;}
 const scrollTop=main.scrollTop;
 const allowed=canEnterApp(state);
 shell.dataset.screen=allowed?current.name:'welcome';
 document.title=`${allowed?titles[current.name]:'시작하기'} · 에고 EGO`;
 header.hidden=!allowed;
 if(allowed){renderHeader(current,state);renderNav(current);}else{setMarkup(header,'');nav.hidden=true;}
 document.querySelector('meta[name="theme-color"]').content=(!allowed||current.name==='home')?'#FFF4E6':'#FFFFFF';
 const content=!allowed?gate(state,current):({home:()=>home(state),ranking:()=>rewards(state),missions,activity:()=>activity(current,state),guide:()=>guide(current),education:()=>education(current,{activityPickerOpen}),estimate,announcements:()=>announcements(state),reviews:()=>reviews(state),wallet:()=>rewards(state),profile:()=>profile(state),settings:()=>settings(state),support}[current.name]||(()=>home(state)))();
 const changed=setMarkup(main,content);
 if(changed&&allowed&&current.name==='home'){
  const rail=main.querySelector('.feature-rail'),cards=rail?.querySelectorAll('.feature-card');
  if(cards?.length){ui.feature=Math.min(ui.feature,cards.length-1);rail.scrollLeft=cards[ui.feature].offsetLeft-cards[0].offsetLeft;}
 }
 if(changed&&sameContext&&focus?.matches('input[type="search"]')&&focus.id){
  const replacement=main.querySelector('#'+CSS.escape(focus.id));
  if(replacement){replacement.replaceWith(focus);}
 }
 renderedRoute=routeKey;renderedAccount=accountKey;
 if(!allowed)document.querySelector('#app-connection').hidden=true;else if(!navigator.onLine){document.querySelector('#app-connection').hidden=false;document.querySelector('#app-connection').textContent='오프라인 · 제출과 계정 내역은 연결 후 이용할 수 있어요.';}else if(state.catalogError&&['home','missions','activity'].includes(current.name)){document.querySelector('#app-connection').hidden=false;document.querySelector('#app-connection').textContent='최신 활동 정보를 연결하지 못했어요. 저장된 촬영 안내를 표시합니다.';}else document.querySelector('#app-connection').hidden=true;
 if(allowed&&current.name==='support'&&(changed||supportAccount!==accountKey)){supportAccount=accountKey;void mountSupport(document.querySelector('#app-support'));}
 if(navigation){main.scrollTo({top:0,behavior:'instant'});window.scrollTo({top:0,behavior:'instant'});if(nav.contains(focus))focus.focus({preventScroll:true});else main.focus({preventScroll:true});}
 else if(changed){main.scrollTop=scrollTop;if(focusTarget){const next=document.querySelector(focusTarget);if(next&&next!==document.activeElement){next.focus({preventScroll:true});if(selection&&next.setSelectionRange&&next.type!=='number')next.setSelectionRange(...selection);}}}
 updateProgress();
 updateLaunch(state);
}
function queueRender(){if(renderQueued)return;renderQueued=true;queueMicrotask(()=>{renderQueued=false;render();});}
function toast(message){clearTimeout(toastTimer);const node=document.querySelector('#app-toast');node.textContent=message;node.hidden=false;toastTimer=setTimeout(()=>{node.hidden=true;},4200);}
function sample(id){if(!navigator.onLine){toast('예시 영상은 인터넷에 연결한 뒤 재생할 수 있어요.');return;}const example=examples.find(item=>item.id===id);if(!example)return;const d=dialog('촬영 예시',`<video src="${example.src}" poster="${example.poster}" controls playsinline preload="metadata"></video><p class="sample-note">${esc(example.note)}</p>`,{wide:true});d.classList.add('app-sample-dialog');}
main.addEventListener('scroll',event=>{
 const rail=event.target;if(!rail.matches?.('.feature-rail'))return;
 const cards=[...rail.querySelectorAll('.feature-card')];if(!cards.length)return;
 const start=cards[0].offsetLeft;
 ui.feature=cards.reduce((best,card,index)=>Math.abs(card.offsetLeft-start-rail.scrollLeft)<Math.abs(cards[best].offsetLeft-start-rail.scrollLeft)?index:best,0);
 main.querySelectorAll('[data-app-action=feature]').forEach(dot=>dot.setAttribute('aria-pressed',String(Number(dot.dataset.index)===ui.feature)));
},{capture:true,passive:true});
main.addEventListener('compositionstart',()=>{composing=true;});
main.addEventListener('compositionend',()=>{composing=false;queueRender();});
main.addEventListener('input',event=>{
 if(event.target.id==='referral-code-input'){setReferralDraft(event.target.value);return;}
 if(event.target.id==='app-review-search'){ui.reviewQuery=event.target.value;render();return;}
 if(event.target.id==='app-estimate-count'){ui.estimateCount=event.target.value;updateEstimate();return;}
 if(event.target.id!=='app-search')return;ui.query=event.target.value;render();
});
main.addEventListener('change',event=>{
 if(handlePreparationChange(event.target))return;
 if(event.target.id==='app-estimate-activity'){ui.estimateActivity=event.target.value;updateEstimate();}
});
main.addEventListener('submit',async event=>{
 if(event.target.id!=='referral-claim-form')return;
 event.preventDefault();
 if(!canEnterApp(getAppState())||!requireFreshAppSession())return;
 setReferralDraft(event.target.elements.code.value);
 if(await claimReferral())toast('초대 코드를 등록했어요.');
});
document.addEventListener('click',async event=>{
 if(event.target.closest('.skip-link')){event.preventDefault();main.focus();return;}
 if(event.target.closest('[data-prep-action],[data-category],[data-review-filter],[data-app-action]:not([data-app-action=login]):not([data-app-action=deletion-receipt])')&&(!canEnterApp(getAppState())||!requireFreshAppSession()))return;
 const prep=event.target.closest('[data-prep-action]');if(prep){const result=handlePreparationClick(prep);if(result?.message)toast(result.message);if(result?.handled)return;}
 const category=event.target.closest('[data-category]');if(category){ui.category=category.dataset.category;if(category.hasAttribute('data-home-category'))location.hash='missions';else render();return;}
 const filter=event.target.closest('[data-review-filter]');if(filter){ui.reviewFilter=filter.dataset.reviewFilter;render();return;}
 const target=event.target.closest('[data-app-action]');if(!target)return;
 const action=target.dataset.appAction;
 const actionKey=action+':'+(target.dataset.id||'');
 if(guardedActions.has(action)){if(pendingActions.has(actionKey))return;pendingActions.set(actionKey,{message:actionMessages[action]||'처리하고 있어요.'});target.disabled=true;target.setAttribute('aria-busy','true');target.dataset.appBusy='true';updateProgress();}
 try{
  if(action==='exchange-coupons')openCouponExchange({getState:getAppState,requireSession:requireFreshAppSession,onComplete:queueRender});
  if(action==='refresh-referrals')await refreshReferrals({force:true});
  if(action==='share-referral'||action==='copy-referral'){const result=await shareReferral({copy:action==='copy-referral'});if(result.kind==='copied')toast('초대 링크를 복사했어요.');else if(result.kind==='manual')dialog('친구 초대 링크',`<p>아래 주소를 직접 복사해주세요.</p><input aria-label="친구 초대 링크" readonly value="${esc(result.url)}">`);}
  if(action==='login')await showAccountEntry({returnTo:location.hash||'#home',provider:target.dataset.provider});
  if(action==='refresh-community')await refreshCommunity({force:true});
  if(action==='share-app'){const share={title:'에고 — 내 시점이 AI가 된다',text:'일상의 순간을 영상으로 담고 AI의 배움에 함께해요.',url:'https://60base.ai/app/'};if(navigator.share){try{await navigator.share(share);}catch(error){if(error.name!=='AbortError')throw error;}}else if(navigator.clipboard){await navigator.clipboard.writeText(share.url);toast('에고 링크를 복사했어요.');}else dialog('에고 소개 공유하기',`<p>아래 주소를 복사해서 공유해주세요.</p><input aria-label="공유 주소" readonly value="${share.url}">`);}
  if(action==='logout'){target.disabled=true;await logout();location.hash='home';}
  if(action==='account')await manageAccount();
  if(action==='deletion-receipt')await openDeletionReceipt();
  if(action==='delete-account')await openAccountDeletion();
  if(action==='device-settings')await openDeviceSettings();
  if(action==='save-activity'){if(!toggleSavedActivity(target.dataset.id))toast(preparationActivityError(target.dataset.id));}
  if(action==='prepare-activity'){if(selectPreparationActivity(target.dataset.id))location.hash=`education/${encodeURIComponent(target.dataset.id)}${target.dataset.returnStep==='3'?'/3':''}`;else toast(preparationActivityError(target.dataset.id));}
  if(action==='saved-filter'){ui.savedOnly=!ui.savedOnly;render();}
  if(action==='examples-filter'){ui.examplesOnly=!ui.examplesOnly;render();}
  if(action==='record')await record(target.dataset.id?selectedTask(target.dataset.id):{id:'camera',title:'촬영 영상',category:'촬영'});
  if(action==='import')await importVideo(target.dataset.id?selectedTask(target.dataset.id):{});
  if(action==='submit-video')await submitClip();
  if(action==='view-submission')await viewSubmission(target.dataset.id);
  if(action==='resubmit')await resubmitSubmission(target.dataset.id);
  if(action==='sample')sample(target.dataset.example);
  if(action==='refresh')await refreshApp({refreshSession:true});
  if(action==='reset-reviews'){ui.reviewFilter='all';ui.reviewQuery='';render();main.querySelector('[data-review-filter="all"]')?.focus({preventScroll:true});}
  if(action==='reset-search'){ui.query='';ui.category='전체';ui.savedOnly=false;ui.examplesOnly=false;render();document.querySelector('#app-search')?.focus();}
  if(action==='install')await requestInstall();
  if(action==='update-app')applyAppUpdate();
  if(action==='feature'){const index=Number(target.dataset.index),rail=main.querySelector('.feature-rail');if(rail){ui.feature=index;main.querySelectorAll('[data-app-action=feature]').forEach(dot=>dot.setAttribute('aria-pressed',String(Number(dot.dataset.index)===index)));rail.scrollTo({left:index*(rail.querySelector('.feature-card').offsetWidth+12),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}
 }catch(error){toast(error.message||'완료하지 못했어요. 다시 시도해주세요.');}
 finally{pendingActions.delete(actionKey);target.disabled=false;target.removeAttribute('aria-busy');delete target.dataset.appBusy;updateProgress();}
});
window.addEventListener('hashchange',()=>{if(canEnterApp(getAppState()))requireFreshAppSession();if(route().name==='reviews'){ui.reviewFilter='all';ui.reviewQuery='';}render({navigation:true});if((route().name==='ranking'||route().name==='wallet')&&canEnterApp(getAppState()))void refreshCommunity();if(route().name==='profile')void refreshReferrals({force:true});if(['profile','reviews','wallet','ranking'].includes(route().name))void refreshApp({reuse:true});});
window.addEventListener('online',()=>void refreshApp({refreshSession:true}));window.addEventListener('offline',queueRender);
subscribeApp(state=>{if(renderedAccount&&renderedAccount!==state.accountKey+'|'+(state.user?.id||'')+'|'+state.access)render();else queueRender();});
subscribePreparation(queueRender);
subscribeCommunity(queueRender);
subscribeReferrals(queueRender);
if(canEnterApp(getAppState()))void refreshReferrals();
initializeWelcomePopup();
window.addEventListener('app-device-settings-changed',queueRender);
window.addEventListener('storage',event=>{if(event.key==='momjit-studio-photo-v1'||event.key===null)queueRender();});
initializeInstall({onChange:queueRender,onMessage:toast});
render();void appReady.then(queueRender);
