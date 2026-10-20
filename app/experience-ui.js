import { mascotMotion } from './mascot-motion.js';
import { esc, points } from '../studio/online-api.js';
import { appleSignInEnabled } from '../studio/cloud-account.js';
import { checkingAppAccess } from './access-boundary.js';

const number = value => new Intl.NumberFormat('ko-KR').format(Number(value) || 0);
export const brandLockup = () => '<span class="app-brand"><span class="alan-brand-mascot"><img src="icons/mascot-purple-3d-20261019.png" width="34" height="36" alt=""></span><span class="alan-wordmark"><img src="icons/ego-wordmark-20261019.png" alt="ego"></span></span>';

export function welcomeScreen(state, { icon, receiptAvailable = false }) {
  const checking = checkingAppAccess(state);
  const error = state.accountConnectionError || '';
  return `<section class="ego-welcome" aria-labelledby="welcome-title">
    <div class="welcome-brand" aria-label="에고">${brandLockup()}</div>
    <p class="welcome-eyebrow">MY EVERYDAY, OUR AI</p><div class="welcome-art" aria-hidden="true">${mascotMotion('welcome')}</div><p class="welcome-art-caption">가벼운 1분, 새로운 시작</p>
    <div class="welcome-intro"><h1 id="welcome-title">나의 일상,<br>그 이상의 가치.</h1><p class="welcome-description">익숙한 손동작을 담아주세요.<br>당신의 시점이 AI의 배움이 됩니다.</p></div>
    <div class="welcome-actions">
      ${checking ? '<p class="welcome-status" role="status">계정을 확인하고 있어요…</p>' : ''}
      ${error ? `<p class="welcome-error" role="alert">${esc(error)}</p>` : ''}
      ${state.access === 'registrationRequired' ? '<button class="welcome-provider primary" data-app-action="login">회원가입 완료하기</button>' : ''}
      ${appleSignInEnabled ? `<button class="welcome-provider" data-app-action="login" data-provider="apple" ${checking ? 'disabled' : ''}><img src="../assets/icons/platform-apple.svg" width="23" height="25" alt="">Apple로 계속하기</button>` : ''}
      <button class="welcome-provider" data-app-action="login" data-provider="google" ${checking ? 'disabled' : ''}><img src="../assets/brand/google-signin-g.png" width="23" height="23" alt="">Google로 계속하기</button>
      <button class="welcome-provider primary" data-app-action="login" ${checking ? 'disabled' : ''}>다른 방법으로 계속하기</button>
      ${receiptAvailable ? '<button type="button" class="text-button" data-app-action="deletion-receipt">계정 삭제 요청 내역 확인</button>' : ''}
      <p class="welcome-legal"><a href="../studio/terms.html">이용약관</a><span>·</span><a href="../studio/privacy.html">개인정보 안내</a></p>
    </div>
  </section>`;
}

export function homeScreen(state, { tasks, activityCard, categoryRail, icon, ui }) {
  const items = tasks();
  const selected = items.filter(task => ui.category === '전체' || task.category === ui.category);
  return `<section class="ego-home-intro"><div><h1>오늘의 1분이<br>새로운 배움이 돼요.</h1><p>내 시점으로 기록하는 일상</p></div><span class="alan-home-art" aria-hidden="true"><span class="alan-mascot-crop alan-home-mascot"><img src="icons/mascot-purple-3d-20261019.png" alt=""></span></span></section>
    <a class="ego-guide-banner" href="#first-filming"><div><h2>처음이라면, 여기부터</h2><p>좋은 영상의 기준을 함께 확인해요.</p></div>${icon('arrow-right')}</a>
    <section class="ego-activity-section"><div class="section-row"><h2>오늘의 촬영 활동</h2><a href="#missions">전체 보기</a></div>${categoryRail()}
    <div class="ego-mission-list">${selected.map((task, index) => activityCard(task, { homeRow: true, featured: index === 0 })).join('') || '<p class="muted-caption">이 카테고리의 활동을 준비하고 있어요.</p>'}</div></section>`;
}

export const mascotArt = () => '<div class="alan-brand-art" aria-hidden="true"><span class="alan-mascot-crop"><img src="icons/mascot-purple-3d-20261019.png" alt=""></span></div>';
export const brandHero = (title, copy, { value = '', warm = true } = {}) => `<section class="alan-brand-hero ${warm ? 'is-warm' : 'is-lavender'}"><h2>${title}</h2>${value ? `<strong class="alan-hero-value">${value}</strong>` : ''}<p>${copy}</p>${mascotArt()}</section>`;
export const summaryStats = items => `<div class="alan-summary-stats">${items.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`;
export function navigationRow(title, copy, href, image, icon, extra = '') {
  return `<a class="alan-navigation-row" href="${href}"><span class="row-icon">${icon(image)}</span><span class="row-copy"><strong>${title}</strong>${copy ? `<small>${copy}</small>` : ''}${extra ? `<em>${extra}</em>` : ''}</span>${icon('caret-right')}</a>`;
}
export function firstFilmingScreen({ icon }) {
  return `<div class="alan-screen-stack"><div class="screen-heading"><h1>내 시점이<br>AI가 된다.</h1></div>${brandHero('익숙한 일상부터', '활동을 고르고 촬영 기준을 확인한 뒤, 내 시점의 1분을 담아요.')}<div class="alan-navigation-list alan-walkthrough">${[
    ['01 · 활동 고르기', '설거지, 빨래 개기 등 익숙한 집안일', '#missions'],
    ['02 · 촬영 준비', '예시와 교육으로 가로 화면 구도 확인', '#education'],
    ['03 · 동의하고 제출', '최종 심사 승인 후 포인트 적립', '#reviews']
  ].map(([title, copy, href]) => `<a class="alan-navigation-row" href="${href}"><span class="row-copy"><strong>${title}</strong><small>${copy}</small></span>${icon('caret-right')}</a>`).join('')}</div><a class="app-button primary" href="#missions">촬영 활동 고르기</a></div>`;
}
export function rankingScreen(community, { icon, button, empty }) {
  const data = community.data;
  const heading = '<div class="screen-heading"><h1>함께 쌓아가는 기록</h1><p>승인된 영상의 포인트로 집계해요.</p></div>';
  if (!data) return heading + (community.loading ? '<p class="app-alert" role="status">기여 현황을 불러오고 있어요.</p>' : empty('기여 현황을 확인해주세요.', community.error || '연결 후 실제 기여 현황을 확인할 수 있어요.', button('다시 불러오기', 'refresh-community')));
  const leaders = [...data.leaders];
  if (data.me.rank && !leaders.some(person => person.isMe)) leaders.push({ ...data.me, isMe: true });
  return `<div class="alan-screen-stack">${heading}${brandHero('승인 영상으로 함께 모은 포인트', '익명 참여자의 기여를 함께 확인해요.', { value: points(data.total.approvedPoints) })}${summaryStats([['참여자', number(data.total.participantCount) + '명'], ['승인 영상', number(data.total.approvedVideoCount) + '개']])}<div class="alan-navigation-list">${leaders.length ? leaders.map(person => navigationRow(`${person.rank || '—'}위 · ${person.isMe ? '나의 순위' : esc(person.label)}`, `${number(Math.floor((person.approvedSeconds || 0) / 60))}분의 기여`, person.isMe ? '#profile' : '#ranking', person.isMe ? 'user' : 'trophy', icon, points(person.points))).join('') : empty('첫 기여자를 기다리고 있어요.', '영상이 승인되면 순위에 반영됩니다.')}</div><p class="muted-caption">친구 초대 포인트 제외 · 동점은 같은 순위<br>개인정보를 제외한 익명으로 표시해요.</p>${button('새로고침', 'refresh-community', '', 'secondary')}</div>`;
}
export function profileScreen(state, { icon, loadingPrivate }) {
  const issue = loadingPrivate(state);
  if (issue) return issue;
  const approved = (state.me.videos || []).filter(video => video.status === 'approved');
  const minutes = Math.floor(approved.reduce((sum, video) => sum + (Number(video.duration) || 0), 0) / 60);
  return `<div class="alan-screen-stack"><div class="screen-heading"><h1>${esc(state.user?.name || '참여자')}님, 반가워요</h1><p>내 시점이 AI가 된다.</p></div>${summaryStats([['승인', approved.length + '회'], ['기여한 시간', minutes + '분']])}${navigationRow('제출한 영상', '심사 상태와 승인 기록', '#reviews', 'video-camera', icon)}${brandHero('일상을 함께 나눠요', '초대한 친구의 첫 영상이 최종 승인되면 나에게 한 번 1,000P가 적립돼요.')}<div class="alan-navigation-list">${navigationRow('친구 초대', '내 초대 코드와 보상 현황', '#referrals', 'user', icon)}${navigationRow('문의·도움', '촬영 · 심사 · 계정', '#support', 'question', icon)}${navigationRow('설정', '내 정보와 기기 촬영 설정', '#settings', 'gear', icon)}</div></div>`;
}
