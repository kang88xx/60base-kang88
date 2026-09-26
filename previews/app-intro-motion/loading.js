const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const preview = document.getElementById('selected-loading');
const manualReduceMotion = document.getElementById('manual-reduce-motion');
const stateText = document.getElementById('loading-state');
let userPaused = false;

function isReducedMotionActive() {
  return prefersReducedMotion.matches || Boolean(manualReduceMotion?.checked);
}

function setState(state) {
  if (!preview || !stateText) return;
  preview.classList.toggle('is-user-paused', userPaused);
  preview.classList.toggle('is-reduced', state === 'reduced');
  if (state === 'paused') {
    stateText.textContent = '정지 상태입니다.';
  } else if (state === 'reduced') {
    stateText.textContent = '기기 설정에 따라 움직임을 최소화했습니다.';
  } else {
    stateText.textContent = '재생 중입니다.';
  }
}

function replay() {
  if (!preview) return;
  userPaused = false;
  if (isReducedMotionActive()) {
    setState('reduced');
    return;
  }
  preview.classList.remove('is-user-paused', 'is-reduced');
  preview.getAnimations({ subtree: true }).forEach((animation) => {
    animation.cancel();
    animation.play();
  });
  setState('playing');
}

function applyPreference() {
  if (isReducedMotionActive()) {
    setState('reduced');
  } else setState(userPaused ? 'paused' : 'playing');
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.action === 'pause') {
      userPaused = true;
      applyPreference();
    } else if (button.dataset.action === 'replay') {
      replay();
    } else {
      userPaused = false;
      setState(isReducedMotionActive() ? 'reduced' : 'playing');
    }
  });
});

manualReduceMotion?.addEventListener('change', applyPreference);

if (typeof prefersReducedMotion.addEventListener === 'function') {
  prefersReducedMotion.addEventListener('change', applyPreference);
} else if (typeof prefersReducedMotion.addListener === 'function') {
  prefersReducedMotion.addListener(applyPreference);
}

applyPreference();
