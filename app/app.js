import { missions, getMission, formatDuration, formatBytes, statusLabel, formatMoney, reviewStatusLabel } from '../shared/data.js';
import { getClips, subscribe, getProfile, saveProfile } from '../shared/store.js';
import { openCapture, openClip, openGuide } from '../shared/capture.js';
import { icon, escapeHTML } from '../shared/ui.js';
import { getServiceState } from '../shared/service-store.js';
import { renderWallet, renderShop, renderReviews, openAccount, openReviewDemo } from '../shared/service-ui.js';

const routes = new Set(['home', 'missions', 'capture', 'library', 'profile', 'reviews', 'wallet', 'shop']);
const state = {
  route: 'home',
  clips: [],
  service: null,
  profile: { name: '참여자', goal: 3 },
  loading: true,
  error: '',
  missionCategory: 'all',
  libraryQuery: '',
  libraryStatus: 'all',
  deferredInstall: null,
  installed: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  profileDirty: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const missionColors = {
  lime: '#dcf79c',
  blue: '#254cf2',
  peach: '#f1c7b7',
  lavender: '#d8d3ff',
  sand: '#ead9a7',
  mint: '#bfead5',
};

function text(value, fallback = '') {
  return escapeHTML(String(value ?? fallback));
}

function missionIconSvg(mission) {
  const fill = missionColors[mission?.color] || mission?.color || missionColors.lime;
  return `
    <svg viewBox="0 0 220 120" aria-hidden="true" focusable="false">
      <rect x="8" y="18" width="88" height="64" rx="24" fill="${text(fill)}" opacity=".95"/>
      <rect x="124" y="32" width="74" height="54" rx="20" fill="#172026" opacity=".92"/>
      <path d="M77 38h24v24h24v24h-24v24H77V86H53V62h24z" fill="#254cf2"/>
      <path d="M32 96c34-30 72-35 114-13 14 7 28 8 43 2" fill="none" stroke="#254cf2" stroke-width="10" stroke-linecap="round"/>
      <circle cx="166" cy="30" r="10" fill="#dcf79c"/>
    </svg>`;
}

function renderIcons() {
  $$('[data-icon]').forEach((target) => {
    const name = target.dataset.icon;
    if (!target.firstElementChild) target.innerHTML = icon(name, 20);
  });
}

function currentRoute() {
  const route = location.hash.replace('#', '') || 'home';
  return routes.has(route) ? route : 'home';
}

function clipMission(clip) {
  return clip?.missionId ? getMission(clip.missionId) : null;
}

function createdLabel(value) {
  if (!value) return '날짜 없음';
  try {
    return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '날짜 없음';
  }
}

function normalizeStatus(status) {
  return status === 'ready' ? 'ready' : 'draft';
}

function actualClips() {
  return state.clips.filter((clip) => !clip.example);
}

function renderStateCard({ title, body, action, actionLabel, iconName = 'camera' }) {
  return `
    <article class="state-card">
      <h3>${text(title)}</h3>
      <p>${text(body)}</p>
      ${action ? `<button class="primary-action" type="button" data-action="${text(action)}"><span data-icon="${text(iconName)}"></span>${text(actionLabel)}</button>` : ''}
    </article>`;
}

function missionCard(mission, compact = false) {
  const completed = actualClips().filter((clip) => clip.missionId === mission.id).length;
  if (compact) {
    return `
      <article class="mini-mission">
        <div>
          <strong>${text(mission.title)}</strong>
          <span>${text(mission.category)} · ${text(mission.duration)}분 · 기록 ${completed}개</span>
        </div>
        <button class="icon-button" type="button" data-action="capture-camera" data-mission-id="${text(mission.id)}" aria-label="${text(mission.title)} 촬영">
          ${icon('camera', 20)}
        </button>
      </article>`;
  }

  return `
    <article class="mission-card">
      <header>
        <div class="mission-copy">
          <div class="mission-meta">
            <span>${text(mission.category)}</span>
            <span>${text(mission.duration)}분</span>
            <span>${text(mission.level)}</span>
            <span>통과 보상 예시 ${text(formatMoney(mission.reward))}</span>
            <span>기록 ${completed}개</span>
          </div>
          <h3>${text(mission.title)}</h3>
          <p>${text(mission.description)}</p>
        </div>
        <div class="mission-icon">${icon(mission.icon || 'spark', 22)}</div>
      </header>
      <div class="mission-actions">
        <button class="secondary-action" type="button" data-action="guide" data-mission-id="${text(mission.id)}">
          <span data-icon="book"></span>가이드
        </button>
        <button class="primary-action" type="button" data-action="capture-camera" data-mission-id="${text(mission.id)}">
          <span data-icon="camera"></span>촬영
        </button>
      </div>
    </article>`;
}

function clipCard(clip) {
  const mission = clipMission(clip);
  const status = normalizeStatus(clip.status);
  const title = clip.title || mission?.title || '제목 없는 기록';
  const submission = state.service?.submissions.find((item) => item.clipId === clip.id);
  return `
    <article class="clip-card">
      <header>
        <button class="clip-title" type="button" data-action="open-clip" data-clip-id="${text(clip.id)}">
          <strong>${text(title)}</strong>
          <span>${text(mission?.title || clip.category || '자유 기록')} · ${text(createdLabel(clip.createdAt))}</span>
        </button>
        <button class="icon-button" type="button" data-action="open-clip" data-clip-id="${text(clip.id)}" aria-label="${text(title)} 열기">
          ${icon('chevron', 20)}
        </button>
      </header>
      <div class="clip-meta">
        <span class="status-${text(submission?.status || status)}">${text(submission ? reviewStatusLabel(submission.status) : statusLabel(status))}</span>
        ${clip.example ? '<span class="status-sample">예시 기록</span>' : ''}
        <span>${text(formatDuration(clip.duration || 0))}</span>
        <span>${text(formatBytes(clip.size || 0))}</span>
        ${clip.source ? `<span>${text(sourceLabel(clip.source))}</span>` : ''}
      </div>
    </article>`;
}

function sourceLabel(source) {
  if (source === 'camera') return '촬영';
  if (source === 'upload') return '가져오기';
  if (source === 'sample') return '예시';
  return source;
}

function chooseRecommendation() {
  if (!missions.length) return null;
  const counts = new Map(missions.map((mission) => [mission.id, 0]));
  actualClips().forEach((clip) => {
    if (counts.has(clip.missionId)) counts.set(clip.missionId, counts.get(clip.missionId) + 1);
  });
  return [...missions].sort((a, b) => (counts.get(a.id) - counts.get(b.id)) || String(a.title).localeCompare(String(b.title), 'ko'))[0];
}

function renderHome() {
  $$('[data-profile-name]').forEach((node) => {
    node.textContent = state.profile.name || '참여자';
  });

  const realClips = actualClips();
  const submissions = state.service?.submissions || [];
  const pending = submissions.filter((item) => ['submitted', 'reviewing'].includes(item.status)).length;
  const approved = submissions.filter((item) => item.status === 'approved').length;
  $('[data-stat="total"]').textContent = realClips.length;
  $('[data-stat="pending"]').textContent = pending;
  $('[data-stat="approved"]').textContent = approved;
  $('[data-wallet-available]').textContent = state.service ? formatMoney(state.service.wallet.available) : '—';
  $('[data-goal-line]').textContent = `실제 기록 ${realClips.length} / 목표 ${Number(state.profile.goal || 3)}`;

  const recommended = $('#recommended-mission');
  const mission = chooseRecommendation();
  if (!mission) {
    recommended.innerHTML = renderStateCard({ title: '미션을 불러오지 못했습니다', body: '잠시 뒤 다시 열어 주세요.' });
  } else {
    const missionClips = realClips.filter((clip) => clip.missionId === mission.id).length;
    recommended.innerHTML = `
      <div class="mission-art">${missionIconSvg(mission)}</div>
      <div class="mission-copy">
        <div class="mission-meta">
          <span>${text(mission.category)}</span>
          <span>${text(mission.duration)}분</span>
          <span>${text(mission.level)}</span>
            <span>통과 보상 예시 ${text(formatMoney(mission.reward))}</span>
          <span>내 기록 ${missionClips}개</span>
        </div>
        <h3>${text(mission.title)}</h3>
        <p>${text(mission.description)}</p>
      </div>
      <div class="mission-actions">
        <button class="secondary-action" type="button" data-action="guide" data-mission-id="${text(mission.id)}"><span data-icon="book"></span>가이드</button>
        <button class="primary-action" type="button" data-action="capture-camera" data-mission-id="${text(mission.id)}"><span data-icon="camera"></span>촬영</button>
      </div>`;
  }

  const recent = $('#recent-clips');
  if (state.loading) {
    recent.innerHTML = renderStateCard({ title: '기록을 불러오는 중', body: '이 브라우저의 저장소를 확인하고 있습니다.' });
  } else if (state.error) {
    recent.innerHTML = renderStateCard({ title: '기록을 불러오지 못했습니다', body: state.error });
  } else if (!state.clips.length) {
    recent.innerHTML = renderStateCard({ title: '아직 기록이 없습니다', body: '첫 미션을 촬영하거나 저장된 영상을 가져와 보세요.', action: 'capture-camera', actionLabel: '첫 기록 만들기' });
  } else {
    recent.innerHTML = state.clips.slice(0, 3).map(clipCard).join('');
  }
}

function renderMissions() {
  const categories = ['all', ...new Set(missions.map((mission) => mission.category).filter(Boolean))];
  $('#mission-filters').innerHTML = categories.map((category) => `
    <button class="chip-button" type="button" data-action="mission-filter" data-category="${text(category)}" aria-pressed="${state.missionCategory === category}">
      ${category === 'all' ? '전체' : text(category)}
    </button>`).join('');

  const filtered = state.missionCategory === 'all'
    ? missions
    : missions.filter((mission) => mission.category === state.missionCategory);
  $('#mission-list').innerHTML = filtered.length
    ? filtered.map((mission) => missionCard(mission)).join('')
    : renderStateCard({ title: '표시할 미션이 없습니다', body: '다른 카테고리를 선택해 주세요.' });
}

function renderCapture() {
  $('#capture-mission-list').innerHTML = missions.length
    ? missions.slice(0, 6).map((mission) => missionCard(mission, true)).join('')
    : renderStateCard({ title: '미션을 불러오지 못했습니다', body: '촬영은 미션 없이도 시작할 수 있습니다.', action: 'capture-camera', actionLabel: '촬영 시작' });
}

function renderLibrary() {
  const query = state.libraryQuery.trim().toLowerCase();
  const filtered = state.clips.filter((clip) => {
    const status = normalizeStatus(clip.status);
    const mission = clipMission(clip);
    const haystack = [clip.title, clip.notes, clip.category, mission?.title, mission?.category].filter(Boolean).join(' ').toLowerCase();
    return (state.libraryStatus === 'all' || status === state.libraryStatus) && (!query || haystack.includes(query));
  });

  const list = $('#library-list');
  if (state.loading) {
    list.innerHTML = renderStateCard({ title: '라이브러리를 불러오는 중', body: '저장된 영상을 확인하고 있습니다.' });
  } else if (state.error) {
    list.innerHTML = renderStateCard({ title: '라이브러리를 열 수 없습니다', body: state.error });
  } else if (!state.clips.length) {
    list.innerHTML = renderStateCard({ title: '저장된 기록이 없습니다', body: '촬영하거나 영상을 가져오면 이곳에 나타납니다.', action: 'capture-camera', actionLabel: '기록 만들기' });
  } else if (!filtered.length) {
    list.innerHTML = renderStateCard({ title: '검색 결과가 없습니다', body: '검색어 또는 상태 필터를 바꿔 보세요.' });
  } else {
    list.innerHTML = filtered.map(clipCard).join('');
  }
}

function installHelpText() {
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (state.installed) return '이미 앱처럼 실행 중입니다.';
  if (state.deferredInstall) return '이 브라우저에서 설치할 수 있습니다.';
  if (isiOS) return 'Safari 공유 버튼에서 홈 화면에 추가를 선택해 주세요.';
  return '브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택해 주세요.';
}

function renderProfile() {
  const nameInput = $('#profile-name');
  const goalInput = $('#profile-goal');
  if (!state.profileDirty && !$('#profile-form').contains(document.activeElement)) {
    nameInput.value = state.profile.name || '참여자';
    goalInput.value = Number(state.profile.goal || 3);
  }
  $('[data-profile-wallet]').textContent = state.service ? `출금 가능 ${formatMoney(state.service.wallet.available)}` : '수익을 불러오는 중';
  const account = state.service?.account;
  $('[data-profile-account]').textContent = account ? `시연 계좌 · 끝 4자리 ${account.last4}` : '시연 계좌를 등록하세요';
  $('#install-help').textContent = installHelpText();
  const installButton = $('#install-button');
  installButton.disabled = state.installed;
  installButton.innerHTML = `<span data-icon="phone"></span>${state.installed ? '설치됨' : '설치'}`;
}

function renderServiceView() {
  const containers = { reviews: '#app-reviews', wallet: '#app-wallet', shop: '#app-shop' };
  const selector = containers[state.route];
  if (!selector) return;
  const container = $(selector);
  if (!state.service) {
    container.innerHTML = renderStateCard({ title: state.error ? '내역을 불러오지 못했습니다' : '내역을 불러오는 중', body: state.error || '저장된 참여 내역을 확인하고 있습니다.' });
    return;
  }
  if (state.route === 'reviews') renderReviews(container, state.service, state.clips);
  if (state.route === 'wallet') renderWallet(container, state.service);
  if (state.route === 'shop') renderShop(container, state.service);
}

function renderRoute() {
  state.route = currentRoute();
  $('.service-preview-notice').hidden = Boolean(state.service && ['reviews', 'wallet', 'shop'].includes(state.route));
  $$('.view').forEach((view) => view.classList.toggle('is-active', view.dataset.view === state.route));
  $$('.bottom-nav a').forEach((tab) => {
    if (tab.dataset.tab === state.route) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

function focusKey() {
  const active = document.activeElement;
  if (!active || active === document.body || active.id === 'main') return null;
  if (active.id) return { id: active.id };
  if (active.dataset?.action === 'mission-filter') return { action: 'mission-filter', category: active.dataset.category };
  return null;
}

function restoreFocus(key) {
  if (!key) return;
  const target = key.id
    ? document.getElementById(key.id)
    : $(`[data-action="${key.action}"][data-category="${CSS.escape(key.category || '')}"]`);
  target?.focus({ preventScroll: true });
}

function focusMissionFilter(category) {
  $(`[data-action="mission-filter"][data-category="${CSS.escape(category || 'all')}"]`)?.focus({ preventScroll: true });
}

function render() {
  const key = focusKey();
  renderRoute();
  renderHome();
  renderMissions();
  renderCapture();
  renderLibrary();
  renderProfile();
  renderServiceView();
  renderIcons();
  restoreFocus(key);
}

function navigate() {
  renderRoute();
  renderServiceView();
  renderIcons();
  $('#main').focus({ preventScroll: true });
}

let refreshVersion = 0;
async function refresh() {
  const version = ++refreshVersion;
  state.error = '';
  try {
    const [clips, profile, service] = await Promise.all([getClips(), getProfile(), getServiceState()]);
    if (version !== refreshVersion) return;
    state.service = service;
    state.clips = Array.isArray(clips) ? clips : [];
    state.profile = profile || { name: '참여자', goal: 3 };
  } catch (error) {
    if (version !== refreshVersion) return;
    state.error = error?.message || '브라우저 저장소 접근 중 문제가 생겼습니다.';
  } finally {
    if (version !== refreshVersion) return;
    state.loading = false;
    render();
  }
}

function bindActions() {
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const missionId = button.dataset.missionId || undefined;
    const clipId = button.dataset.clipId;

    if (action === 'app-account') openAccount();
    if (action === 'app-review-demo') openReviewDemo();
    if (action === 'capture-camera') openCapture({ mode: 'camera', missionId });
    if (action === 'capture-upload') openCapture({ mode: 'upload', missionId });
    if (action === 'guide' && missionId) openGuide(missionId);
    if (action === 'open-clip' && clipId) openClip(clipId);
    if (action === 'mission-filter') {
      state.missionCategory = button.dataset.category || 'all';
      renderMissions();
      renderIcons();
      focusMissionFilter(state.missionCategory);
    }
  });

  $('#library-search').addEventListener('input', (event) => {
    state.libraryQuery = event.target.value;
    renderLibrary();
    renderIcons();
  });

  $('#library-status').addEventListener('change', (event) => {
    state.libraryStatus = event.target.value;
    renderLibrary();
    renderIcons();
  });

  $('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = $('#profile-form');
    const nameInput = $('#profile-name');
    const goalInput = $('#profile-goal');
    const name = nameInput.value.trim();
    nameInput.setCustomValidity(name ? '' : '이름을 입력해 주세요.');
    if (!form.reportValidity()) {
      $('#profile-status').textContent = name ? '목표는 1부터 30 사이의 숫자로 입력해 주세요.' : '이름을 입력해 주세요.';
      return;
    }
    const goal = Number(goalInput.value);
    $('#profile-status').textContent = '저장 중입니다.';
    try {
      await saveProfile({ name, goal });
      state.profile = { name, goal };
      state.profileDirty = false;
      $('#profile-status').textContent = '프로필을 저장했습니다.';
      render();
    } catch (error) {
      $('#profile-status').textContent = error?.message || '프로필을 저장하지 못했습니다.';
    }
  });

  $('#profile-form').addEventListener('input', () => {
    state.profileDirty = true;
    $('#profile-name').setCustomValidity('');
  });

  $('#install-button').addEventListener('click', async () => {
    if (!state.deferredInstall) {
      $('#install-help').textContent = installHelpText();
      return;
    }
    state.deferredInstall.prompt();
    await state.deferredInstall.userChoice.catch(() => null);
    state.deferredInstall = null;
    renderProfile();
    renderIcons();
  });
}

function bindLifecycle() {
  window.addEventListener('hashchange', navigate);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstall = event;
    renderProfile();
    renderIcons();
  });
  window.addEventListener('appinstalled', () => {
    state.installed = true;
    state.deferredInstall = null;
    renderProfile();
    renderIcons();
  });
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  subscribe(() => refresh());
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    // The root service worker is owned by the shared shell. The app remains usable without it.
  }
}

bindActions();
bindLifecycle();
render();
refresh();
registerServiceWorker();
