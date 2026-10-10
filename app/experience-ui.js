import { esc, points } from '../studio/online-api.js';
import { appleSignInEnabled } from '../studio/cloud-account.js';
import { checkingAppAccess } from './access-boundary.js';

const number = value => new Intl.NumberFormat('ko-KR').format(Number(value) || 0);
export const brandLockup = () => '<span class="app-brand"><img src="icons/symbol.svg" width="34" height="36" alt=""><span>ego</span></span>';

export function welcomeScreen(state, { icon }) {
  const checking = checkingAppAccess(state);
  const error = state.accountConnectionError || '';
  return `<section class="ego-welcome" aria-labelledby="welcome-title">
    <div class="welcome-brand" aria-label="에고">${brandLockup()}</div>
    <div class="welcome-intro"><p class="welcome-eyebrow">반가워요, 에고입니다</p><h1 id="welcome-title">내 일상이,<br>AI의 배움이<br>되는 곳.</h1><p class="welcome-description">익숙한 순간을 영상으로 담고<br>당신의 기여를 포인트로 돌려받아요.</p></div>
    <div class="welcome-art" aria-hidden="true"><img src="icons/symbol.svg" width="190" height="200" alt=""></div>
    <div class="welcome-actions">
      ${checking ? '<p class="welcome-status" role="status">계정을 확인하고 있어요…</p>' : ''}
      ${error ? `<p class="welcome-error" role="alert">${esc(error)}</p>` : ''}
      ${state.access === 'registrationRequired' ? '<button class="welcome-provider primary" data-app-action="login">회원가입 완료하기</button>' : ''}
      ${appleSignInEnabled ? `<button class="welcome-provider" data-app-action="login" data-provider="apple" ${checking ? 'disabled' : ''}><img src="../assets/promo/platform-apple.svg" width="23" height="25" alt="">Apple로 계속하기</button>` : ''}
      <button class="welcome-provider" data-app-action="login" data-provider="google" ${checking ? 'disabled' : ''}><img src="../assets/brand/google-signin-g.png" width="23" height="23" alt="">Google로 계속하기</button>
      <button class="welcome-provider primary" data-app-action="login" data-provider="email" ${checking ? 'disabled' : ''}>${icon('envelope')}이메일로 계속하기</button>
      <p class="welcome-legal"><a href="../studio/terms.html">이용약관</a><span>·</span><a href="../studio/privacy.html">개인정보 처리방침</a></p>
    </div>
  </section>`;
}

export function homeScreen(state, { tasks, taskMedia, rewardPill, categoryRail, icon, ui }) {
  const items = tasks();
  const featured = items.filter(task => task.exampleId).slice(0, 5);
  if (!featured.length) featured.push(...items.slice(0, 4));
  const selected = items.filter(task => ui.category === '전체' || task.category === ui.category);
  return `<section class="ego-home-intro"><div><p class="eyebrow">MY EVERYDAY, OUR AI</p><h1>오늘은 어떤 일상을<br>담아볼까요?</h1></div><a class="round-button" href="#announcements" aria-label="공지사항">${icon('envelope')}</a></section>
    <section class="ego-featured" aria-label="추천 촬영 활동"><div class="feature-rail">${featured.map((task, index) => `<a class="feature-card" href="#activity/${encodeURIComponent(task.id)}" aria-label="${esc(task.title)} 촬영 안내">${taskMedia(task, { hero: index === 0 })}<div class="feature-copy"><span class="feature-category">${esc(task.category)} · 영상 촬영</span><h2>${esc(task.title)}</h2><p>${esc(task.description)}</p><div class="feature-reward"><span>검수 승인 시</span>${rewardPill(task)}</div></div></a>`).join('')}</div><div class="rail-dots" role="group" aria-label="추천 활동 선택">${featured.map((task, index) => `<button type="button" data-app-action="feature" data-index="${index}" aria-label="${index + 1}번째 ${esc(task.title)} 보기" aria-pressed="${ui.feature === index}"><span></span></button>`).join('')}</div></section>
    <a class="ego-guide-banner" href="#education"><div><span>첫 촬영이신가요?</span><h2>시작은 가볍게,<br>좋은 영상은 차근차근.</h2><p>촬영 가이드 확인하기 ${icon('arrow-right')}</p></div><img src="icons/symbol.svg" width="80" height="85" alt=""></a>
    <section class="ego-activity-section"><div class="section-row"><h2>카테고리</h2><a href="#missions">전체 보기 ${icon('caret-right')}</a></div>${categoryRail()}
    <div class="ego-mission-list">${selected.map(task => `<a class="ego-mission-row" href="#activity/${encodeURIComponent(task.id)}"><div class="mission-kind">${icon('video-camera')} 영상</div><div class="mission-row-content">${taskMedia(task)}<div class="mission-row-copy"><h3>${esc(task.title)}</h3><p>${esc(task.description)}</p></div>${rewardPill(task, 'small')}</div></a>`).join('') || '<p class="muted-caption">이 카테고리의 활동을 준비하고 있어요.</p>'}</div></section>`;
}

function progressCard(me, icon) {
  const seconds = Number(me?.approvedSeconds) || 0;
  const minutes = Math.floor(seconds / 60);
  const steps = [5, 30, 60];
  const next = steps.find(value => minutes < value) || Math.ceil((minutes + 1) / 60) * 60;
  return `<section class="ego-progress-card"><div class="section-row"><span class="contributor-badge">${icon('plant')} 나의 기여</span><span>승인 영상 ${number(me?.approvedVideoCount)}개</span></div><h2>${number(minutes)}<small>분의 일상을 나눴어요</small></h2><progress max="${next}" value="${Math.min(minutes, next)}" aria-label="승인 촬영 ${minutes}분, 다음 기록 ${next}분"></progress><div class="progress-labels"><span>승인 촬영 시간</span><span>다음 기록 ${next}분</span></div><p>한 편씩 쌓이는 기록이 AI의 배움이 됩니다.</p></section>`;
}

export function rankingScreen(community, { icon, button, empty }) {
  const data = community.data;
  if (!data) return `<div class="screen-heading"><p class="eyebrow">OUR CONTRIBUTION</p><h1>함께 쌓아가는 기록</h1><p>승인된 촬영과 포인트를 기준으로 집계해요.</p></div>${community.loading ? '<p class="app-alert" role="status">기여 현황을 불러오고 있어요.</p>' : empty('기여 현황을 확인해주세요.', community.error || '연결 후 실제 기여 현황을 확인할 수 있어요.', button('다시 불러오기', 'refresh-community'))}`;
  const podium = data.leaders.slice(0, 3);
  const order = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  const row = (person, mine = false) => `<article class="ranking-row ${mine ? 'is-me' : ''}"><strong class="rank-number">${person.rank || '—'}</strong><span class="ranking-avatar" aria-hidden="true">${icon(mine ? 'user' : 'plant')}</span><div><h3>${mine ? '나의 순위' : esc(person.label)}</h3><small>${number(Math.floor((person.approvedSeconds || 0) / 60))}분의 기여</small></div><strong>${points(person.points)}</strong></article>`;
  return `<div class="screen-heading compact-heading"><p class="eyebrow">OUR CONTRIBUTION</p><h1>함께 쌓아가는 기록</h1></div>${progressCard(data.me, icon)}
    <section class="ego-total-card"><div><p>에고에서 함께 모은 포인트</p><strong>${number(data.total.approvedPoints)}<small>P</small></strong><span>${number(data.total.participantCount)}명의 기여 · 승인 영상 ${number(data.total.approvedVideoCount)}개</span></div><span class="total-icon">${icon('trophy')}</span></section>
    <section class="ego-ranking"><div class="section-row"><h2>TOP 기여자</h2><button type="button" class="round-button" data-app-action="refresh-community" aria-label="랭킹 새로고침">${icon('arrow-clockwise')}</button></div>${podium.length ? `<div class="ranking-podium">${order.map(person => `<article class="podium-person ${person.rank === 1 ? 'is-first' : ''}"><div class="podium-avatar">${icon('user')}<span>${person.rank}</span></div><h3>${person.isMe ? '나' : esc(person.label)}</h3><strong>${points(person.points)}</strong></article>`).join('')}</div><div class="ranking-list">${data.leaders.slice(3).map(person => row(person, person.isMe)).join('')}</div>` : empty('첫 기여자를 기다리고 있어요.', '영상이 승인되고 포인트가 적립되면 순위에 반영됩니다.', '<a class="app-button primary" href="#missions">활동 고르기</a>')}
    ${row(data.me, true)}<p class="muted-caption ranking-note">누적 승인 포인트 기준 · 동점은 같은 순위<br>참여자는 개인정보를 제외한 익명으로 표시돼요.</p></section>`;
}

export function profileScreen(state, { icon, getDevicePhoto, reviewFilters, reviewList, loadingPrivate, points }) {
  const me = state.me, user = state.user;
  const videos = me?.videos || [];
  const approved = videos.filter(video => video.status === 'approved');
  const minutes = Math.floor(approved.reduce((sum, video) => sum + (Number(video.duration) || 0), 0) / 60);
  return `<a class="identity-card" href="#settings"><span class="identity-avatar">${getDevicePhoto() ? `<img src="${getDevicePhoto()}" alt="내 프로필 사진">` : icon('user')}</span><span class="identity-details"><strong>${esc(user?.name || '참여자')}</strong><small>${esc(user?.email || '')}</small><span class="identity-meta">${icon('check-circle')} 승인 ${approved.length}회 <span>·</span> ${icon('clock')} ${minutes}분</span></span>${icon('caret-right')}</a>
    <section class="ego-share-card"><div class="section-row"><span class="contributor-badge">친구 초대 혜택 · 준비 중</span>${icon('plant')}</div><h1>함께 기록하면,<br>더 즐거운 일상.</h1><p>에고를 친구에게 소개해보세요.<br>초대 혜택은 곧 안내해드릴게요.</p><div class="profile-stat-grid"><div><strong>${videos.filter(v => !['deleted', 'deleting'].includes(v.status)).length}</strong><span>제출한 영상</span></div><div><strong>${approved.length}</strong><span>승인된 영상</span></div><div><strong>${me ? points(me.wallet.earned) : '—'}</strong><span>누적 포인트</span></div></div><button class="app-button secondary" type="button" data-app-action="share-app">에고 소개 공유하기 ${icon('arrow-right')}</button></section>
    <div class="profile-shortcuts"><a href="#library">${icon('video-camera')} 보관한 영상 ${icon('caret-right')}</a><a href="#support">${icon('question')} 문의·도움 ${icon('caret-right')}</a></div>
    <section class="profile-submissions"><div class="section-row"><h2>내 제출 내역</h2><a href="#reviews">모두 보기 ${icon('caret-right')}</a></div>${reviewFilters()}${loadingPrivate(state) || reviewList(videos)}</section>`;
}
