const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const manualReduceMotion = document.getElementById('manual-reduce-motion');
const motionPreviews = Array.from(document.querySelectorAll('[data-motion]'));
const states = new Map(motionPreviews.map((preview) => [preview.id, {
  userPaused: false,
  documentHidden: document.hidden,
  offscreen: false,
}]));
let observer;

function isReducedMotionActive() {
  return prefersReducedMotion.matches || Boolean(manualReduceMotion?.checked);
}

function renderMotion(targetId) {
  const preview = document.getElementById(targetId);
  if (!preview) return;

  const state = states.get(targetId) || { userPaused: false, documentHidden: document.hidden, offscreen: false };
  const reduced = isReducedMotionActive();
  const autoPaused = state.documentHidden || state.offscreen;

  preview.classList.toggle('is-user-paused', state.userPaused);
  preview.classList.toggle('is-auto-paused', autoPaused);
  preview.classList.toggle('is-reduced', reduced);

  const stateText = document.querySelector(`[data-state-for="${targetId}"]`);
  if (!stateText) return;

  if (reduced) {
    stateText.textContent = '기기 설정에 따라 움직임을 최소화했습니다.';
  } else if (state.userPaused) {
    stateText.textContent = '정지 상태입니다.';
  } else if (autoPaused) {
    stateText.textContent = '화면 밖에서는 모션을 멈춥니다.';
  } else {
    stateText.textContent = '재생 중입니다.';
  }
}

function setUserPaused(targetId, paused) {
  const state = states.get(targetId);
  if (!state) return;
  state.userPaused = paused;
  renderMotion(targetId);
}

function setDocumentHidden(hidden) {
  states.forEach((state, targetId) => {
    state.documentHidden = hidden;
    renderMotion(targetId);
  });
  document.body.classList.toggle('is-preview-hidden', hidden);
}

function setOffscreen(targetId, offscreen) {
  const state = states.get(targetId);
  if (!state) return;
  state.offscreen = offscreen;
  renderMotion(targetId);
}

function replayMotion(targetId) {
  const preview = document.getElementById(targetId);
  if (!preview) return;

  if (isReducedMotionActive()) {
    const state = states.get(targetId);
    if (state) state.userPaused = false;
    renderMotion(targetId);
    return;
  }

  const state = states.get(targetId);
  if (state) {
    state.userPaused = false;
    state.documentHidden = document.hidden;
  }
  preview.getAnimations({ subtree: true }).forEach((animation) => {
    animation.cancel();
    animation.play();
  });
  renderMotion(targetId);
}

function applyMotionPreference() {
  states.forEach((_, targetId) => renderMotion(targetId));
}

function applyOffscreenState(entry) {
  const preview = entry.target;
  if (!preview.id || document.hidden) return;
  setOffscreen(preview.id, !entry.isIntersecting);
}

function installOffscreenPause() {
  if (!('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver((entries) => {
    entries.forEach(applyOffscreenState);
  }, { threshold: 0.12 });
  motionPreviews.forEach((preview) => observer.observe(preview));
}

document.querySelectorAll('[data-action]').forEach((control) => {
  control.addEventListener('click', () => {
    const target = control.dataset.target;
    const action = control.dataset.action;
    if (action === 'pause') {
      setUserPaused(target, true);
    } else if (action === 'replay') {
      replayMotion(target);
    } else {
      setUserPaused(target, false);
    }
  });
});

manualReduceMotion?.addEventListener('change', applyMotionPreference);
document.addEventListener('visibilitychange', () => setDocumentHidden(document.hidden));

if (typeof prefersReducedMotion.addEventListener === 'function') {
  prefersReducedMotion.addEventListener('change', applyMotionPreference);
} else if (typeof prefersReducedMotion.addListener === 'function') {
  prefersReducedMotion.addListener(applyMotionPreference);
}

installOffscreenPause();
setDocumentHidden(document.hidden);
applyMotionPreference();
