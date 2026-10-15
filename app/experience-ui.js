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
      ${appleSignInEnabled ? `<button class="welcome-provider" data-app-action="login" data-provider="apple" ${checking ? 'disabled' : ''}><img src="../assets/icons/platform-apple.svg" width="23" height="25" alt="">Apple로 계속하기</button>` : ''}
      <button class="welcome-provider" data-app-action="login" data-provider="google" ${checking ? 'disabled' : ''}><img src="../assets/brand/google-signin-g.png" width="23" height="23" alt="">Google로 계속하기</button>
      <button class="welcome-provider primary" data-app-action="login" data-provider="email" ${checking ? 'disabled' : ''}>${icon('envelope')}이메일로 계속하기</button>
      <p class="welcome-legal"><a href="../studio/terms.html">이용약관</a><span>·</span><a href="../studio/privacy.html">개인정보 처리방침</a></p>
    </div>
  </section>`;
}

export function homeScreen(state, { tasks, activityCard, categoryRail, icon, ui }) {
  const items = tasks();
  const selected = items.filter(task => ui.category === '전체' || task.category === ui.category);
  return `<section class="ego-home-intro"><div><p class="eyebrow">MY EVERYDAY, OUR AI</p><h1>오늘은 어떤 일상을<br>담아볼까요?</h1></div><a class="round-button" href="#announcements" aria-label="공지사항">${icon('bell')}</a></section>
    <a class="ego-guide-banner" href="#education"><div><span>첫 촬영이신가요?</span><h2>시작은 가볍게,<br>좋은 영상은 차근차근.</h2><p>촬영 가이드 확인하기 ${icon('arrow-right')}</p></div><img src="icons/symbol.svg" width="80" height="85" alt=""></a>
    <section class="ego-activity-section"><div class="section-row"><h2>카테고리</h2><a href="#missions">전체 보기 ${icon('caret-right')}</a></div>${categoryRail()}
    <div class="ego-mission-list">${selected.map(task => activityCard(task, { homeRow: true })).join('') || '<p class="muted-caption">이 카테고리의 활동을 준비하고 있어요.</p>'}</div></section>`;
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
  if (!data) return `<div class="screen-heading"><p class="eyebrow">OUR CONTRIBUTION</p><h1>함께 쌓아가는 기록</h1><p>최종 승인된 영상의 포인트로 집계해요. 친구 초대 포인트는 제외됩니다.</p></div>${community.loading ? '<p class="app-alert" role="status">기여 현황을 불러오고 있어요.</p>' : empty('기여 현황을 확인해주세요.', community.error || '연결 후 실제 기여 현황을 확인할 수 있어요.', button('다시 불러오기', 'refresh-community'))}`;
  const podium = data.leaders.slice(0, 3);
  const order = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  const row = (person, mine = false) => `<article class="ranking-row ${mine ? 'is-me' : ''}"><strong class="rank-number">${person.rank || '—'}</strong><span class="ranking-avatar" aria-hidden="true">${icon(mine ? 'user' : 'plant')}</span><div><h3>${mine ? '나의 순위' : esc(person.label)}</h3><small>${number(Math.floor((person.approvedSeconds || 0) / 60))}분의 기여</small></div><strong>${points(person.points)}</strong></article>`;
  return `<div class="screen-heading compact-heading"><p class="eyebrow">OUR CONTRIBUTION</p><h1>함께 쌓아가는 기록</h1></div>${progressCard(data.me, icon)}
    <section class="ego-total-card"><div><p>승인 영상으로 함께 모은 포인트</p><strong>${number(data.total.approvedPoints)}<small>P</small></strong><span>${number(data.total.participantCount)}명의 기여 · 승인 영상 ${number(data.total.approvedVideoCount)}개</span></div><span class="total-icon">${icon('trophy')}</span></section>
    <section class="ego-ranking"><div class="section-row"><h2>TOP 기여자</h2><button type="button" class="round-button" data-app-action="refresh-community" aria-label="랭킹 새로고침">${icon('arrow-clockwise')}</button></div>${podium.length ? `<div class="ranking-podium">${order.map(person => `<article class="podium-person ${person.rank === 1 ? 'is-first' : ''}"><div class="podium-avatar">${icon('user')}<span>${person.rank}</span></div><h3>${person.isMe ? '나' : esc(person.label)}</h3><strong>${points(person.points)}</strong></article>`).join('')}</div><div class="ranking-list">${data.leaders.slice(3).map(person => row(person, person.isMe)).join('')}</div>` : empty('첫 기여자를 기다리고 있어요.', '영상이 승인되고 포인트가 적립되면 순위에 반영됩니다.', '<a class="app-button primary" href="#missions">활동 고르기</a>')}
    ${row(data.me, true)}<p class="muted-caption ranking-note">승인 영상 포인트 기준 · 친구 초대 포인트 제외 · 동점은 같은 순위<br>참여자는 개인정보를 제외한 익명으로 표시돼요.</p></section>`;
}

export function profileScreen(state, { icon, getDevicePhoto, reviewFilters, reviewList, loadingPrivate, points, referral }) {
  const me = state.me, user = state.user;
  const videos = me?.videos || [];
  const approved = videos.filter(video => video.status === 'approved');
  const minutes = Math.floor(approved.reduce((sum, video) => sum + (Number(video.duration) || 0), 0) / 60);
  return `<a class="identity-card" href="#settings"><span class="identity-avatar">${getDevicePhoto() ? `<img src="${getDevicePhoto()}" alt="내 프로필 사진">` : icon('user')}</span><span class="identity-details"><strong>${esc(user?.name || '참여자')}</strong><small>${esc(user?.email || '')}</small><span class="identity-meta">${icon('check-circle')} 승인 ${approved.length}회 <span>·</span> ${icon('clock')} ${minutes}분</span></span>${icon('caret-right')}</a>
    ${referral}
    <div class="profile-shortcuts"><a href="#library">${icon('video-camera')} 보관한 영상 ${icon('caret-right')}</a><a href="#support">${icon('question')} 문의·도움 ${icon('caret-right')}</a></div>
    <section class="profile-submissions"><div class="section-row"><h2>내 제출 내역</h2><a href="#reviews">모두 보기 ${icon('caret-right')}</a></div>${reviewFilters()}${loadingPrivate(state) || reviewList(videos)}</section>`;
}
