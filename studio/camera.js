import { VIDEO_TARGET_SECONDS, videoDurationError, assertVideoDuration } from '../shared/video-policy.js';
import { mascotMotion } from '../app/mascot-motion.js';
import { isNativeApp, shareNativeBlob } from '../app/native.js';
import { deleteClip, saveClip } from '../shared/store.js';
import { formatBytes, formatDuration } from '../shared/data.js';
import { escapeHTML as esc, icon } from '../shared/ui.js';

const TARGET_DURATION_MS = VIDEO_TARGET_SECONDS * 1000;
// Allow the encoder's final frame to land beyond 60s; file validation stays exact.
const ENCODER_FINAL_FRAME_MARGIN_MS = 250;
const MAX_DURATION_MS = TARGET_DURATION_MS + ENCODER_FINAL_FRAME_MARGIN_MS;
const MAX_SIZE = 250 * 1024 * 1024;
const ZOOM_TIMEOUT_MS = 1500;
const GUIDE_LINES = ['1분 자동 종료', '가로로 고정', '손과 작업 대상', '얼굴·개인정보 제외'];
const MP4_MIME_CANDIDATES = [
  'video/mp4;codecs=h264',
  'video/mp4',
];
const WEBM_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

let activeCamera = null;

const hasMediaDevices = () => Boolean(navigator.mediaDevices?.getUserMedia);
const hasRecorder = () => typeof MediaRecorder === 'function';
const now = () => (performance?.now ? performance.now() : Date.now());
const safeTitle = activity => String(activity?.title || '촬영 영상').trim().slice(0, 120) || '촬영 영상';
const safeCategory = activity => String(activity?.category || '촬영').trim().slice(0, 60) || '촬영';
const safeActivityId = activity => String(activity?.id || 'camera').trim().slice(0, 80) || 'camera';
const isSafariRecorder = () => /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/i.test(navigator.userAgent);
const pickMimeType = () => {
  if (!hasRecorder() || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  const candidates = isSafariRecorder()
    ? [...MP4_MIME_CANDIDATES, ...WEBM_MIME_CANDIDATES]
    : [...WEBM_MIME_CANDIDATES, ...MP4_MIME_CANDIDATES];
  return candidates.find(type => {
    try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
  }) || '';
};
const fileNameFor = (title, mimeType = 'video/webm') => {
  const base = String(title || '60base-camera').replace(/[\\/:*?"<>|]/g, '_').trim() || '60base-camera';
  return `${base}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
};

function usefulError(error) {
  if (!window.isSecureContext) return '보안 연결에서만 카메라를 사용할 수 있어요. https 주소로 다시 열어주세요.';
  if (!hasMediaDevices()) return '이 브라우저는 웹 카메라 촬영을 지원하지 않아요. 아래 파일 촬영 버튼을 사용해보세요.';
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '카메라 권한이 거부됐어요. 브라우저 주소창의 권한 설정을 바꾼 뒤 다시 시도해주세요.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '사용할 수 있는 카메라를 찾지 못했어요. 카메라 연결과 권한을 확인해주세요.';
  if (name === 'NotReadableError' || name === 'AbortError') return '다른 앱이 카메라를 사용 중일 수 있어요. 다른 화상 회의나 카메라 앱을 닫고 다시 시도해주세요.';
  if (name === 'TypeError') return '현재 브라우저 환경에서 카메라 요청을 시작할 수 없어요. 권한과 보안 연결을 확인해주세요.';
  return error?.message || '카메라를 시작하지 못했어요. 잠시 뒤 다시 시도해주세요.';
}

function inspectVideo(blob) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    let done = false;
    const finish = (error, details) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.onloadedmetadata = video.ondurationchange = video.ontimeupdate = video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      error ? reject(error) : resolve(details);
    };
    const timer = setTimeout(() => finish(new Error('촬영한 영상 정보를 읽지 못했어요. 다운로드하거나 다시 촬영해주세요.')), 8000);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const read = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) return false;
      finish(null, { duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      return true;
    };
    video.onloadedmetadata = () => {
      if (!read()) { video.ondurationchange = video.ontimeupdate = read; video.currentTime = 1e10; }
    };
    video.onerror = () => finish(new Error('촬영한 영상을 읽지 못했어요. 다시 촬영하거나 다운로드로 보관해주세요.'));
    video.src = url;
  });
}

function buildDialog(activity, canRecord, submission = false) {
  const title = safeTitle(activity);
  const dialog = document.createElement('dialog');
  dialog.className = 'studio-camera-dialog';
  dialog.setAttribute('aria-labelledby', 'studio-camera-title');
  dialog.innerHTML = `
    <div class="studio-camera-shell" data-camera-stage>
      <video class="studio-camera-live" autoplay muted playsinline></video>
      <div class="studio-camera-review-stage" data-camera-review hidden>
        <video class="studio-camera-review" controls playsinline></video>
      </div>
      <div class="studio-camera-scrim" data-guide>
        <div class="studio-camera-guide" data-camera-guide role="note" aria-label="촬영 가이드">
          ${GUIDE_LINES.map(line => `<span>${esc(line)}</span>`).join('')}
        </div>
      </div>
      <section class="studio-processing-heading" data-processing-heading hidden><h2>촬영한 영상을<br>준비하고 있어요.</h2><span data-processing-mascot></span></section>
      <div class="studio-camera-top">
        <button class="studio-camera-tool" type="button" data-close aria-label="카메라 닫기" title="닫기">${icon('close', 20)}</button>
        <div class="studio-camera-heading">
          <p id="studio-camera-title">${esc(title)}</p>
          <span data-status role="status" aria-live="polite">카메라를 준비하고 있어요.</span>
        </div>
        <button class="studio-camera-tool" type="button" data-guide-toggle aria-label="촬영 가이드 보기" title="촬영 가이드">${icon('help', 20)}</button>
        <button class="studio-camera-tool" type="button" data-flip aria-label="카메라 전환" title="카메라 전환" hidden>${icon('camera', 20)}</button>
      </div>
      <div class="studio-camera-timer" data-timer hidden><i></i><span>00:00</span></div>
      <div class="studio-camera-error" data-error role="status" aria-live="assertive" hidden></div>
      <div class="studio-camera-bottom" data-camera-controls>
        <div class="studio-camera-zoom" data-camera-zoom hidden>
          <div role="group" aria-label="카메라 배율">
            ${[0.5, 1, 2].map(value => `<button type="button" data-zoom="${value}" aria-pressed="false" disabled>${value}×</button>`).join('')}
          </div>
          <span data-zoom-status role="status" aria-live="polite">배율을 확인하고 있어요.</span>
        </div>
        <button class="studio-camera-record" type="button" data-record aria-label="녹화 시작" ${canRecord ? '' : 'hidden'}><span></span></button>
        <button class="studio-camera-stop" type="button" data-stop hidden>녹화 마치기</button>
        <button class="studio-camera-retry" type="button" data-retry data-camera-retry hidden>${icon('camera', 18)} 다시 시도</button>
        <label class="studio-camera-file" data-file-fallback ${canRecord ? 'hidden' : ''}>
          ${icon('phone', 18)} 휴대폰 카메라로 촬영
          <input type="file" accept="video/*" capture="environment">
        </label>
      </div>
      <section class="studio-camera-review-sheet" data-review-sheet hidden aria-label="촬영 영상 확인">
        <div>
          <h2>${esc(title)}</h2>
          <p data-meta>촬영 정보를 확인하고 있어요.</p>
          <p>${submission ? '영상을 확인한 뒤 제출해주세요. 다음 화면에서 이용 범위와 동의를 확인합니다.' : '이 브라우저에 저장됩니다. 자동 제출되지 않으며, 심사 제출은 별도 버튼을 눌러 진행합니다.'}</p>
        </div>
        <p class="studio-camera-save-status" data-save-status role="status" aria-live="polite"></p>
        <div class="studio-camera-review-actions">
          <button class="button" type="button" data-retake>다시 촬영</button>
          <button class="button" type="button" data-download>${icon('download', 17)} 다운로드</button>
          <button class="button primary" type="button" data-save>${submission ? '제출 계속하기' : '이 브라우저에 저장'}</button>
          <button class="button" type="button" data-open-saved hidden>보관한 영상 보기</button>
          <button class="button primary" type="button" data-submit hidden>심사 제출하기</button>
        </div>
      </section>
      <div class="studio-camera-confirm" data-confirm hidden role="alertdialog" aria-modal="true" aria-labelledby="studio-camera-confirm-title">
        <div>
          <h2 id="studio-camera-confirm-title">촬영한 영상을 버릴까요?</h2>
          <p>아직 제출하지 않은 영상입니다.</p>
          <div>
            <button class="button" type="button" data-confirm-cancel>계속 보기</button>
            <button class="button danger" type="button" data-confirm-discard>버리고 닫기</button>
          </div>
        </div>
      </div>
    </div>`;
  return dialog;
}

class StudioCamera {
  constructor(options) {
    this.activity = options.activity || {};
    this.isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : () => true;
    this.onSaved = typeof options.onSaved === 'function' ? options.onSaved : () => {};
    this.onSubmit = typeof options.onSubmit === 'function' ? options.onSubmit : null;
    this.trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.mimeType = pickMimeType();
    this.dialog = buildDialog(this.activity, hasMediaDevices() && hasRecorder(), Boolean(this.onSubmit));
    this.liveVideo = this.dialog.querySelector('.studio-camera-live');
    this.reviewVideo = this.dialog.querySelector('.studio-camera-review');
    this.statusNode = this.dialog.querySelector('[data-status]');
    this.errorNode = this.dialog.querySelector('[data-error]');
    this.timerNode = this.dialog.querySelector('[data-timer]');
    this.reviewStage = this.dialog.querySelector('[data-camera-review]');
    this.guideButton = this.dialog.querySelector('[data-guide-toggle]');
    this.recordButton = this.dialog.querySelector('[data-record]');
    this.stopButton = this.dialog.querySelector('[data-stop]');
    this.flipButton = this.dialog.querySelector('[data-flip]');
    this.zoomNode = this.dialog.querySelector('[data-camera-zoom]');
    this.zoomStatus = this.dialog.querySelector('[data-zoom-status]');
    this.zoomButtons = [...this.dialog.querySelectorAll('[data-zoom]')];
    this.zoomSession = null;
    this.retryButton = this.dialog.querySelector('[data-retry]');
    this.fileInput = this.dialog.querySelector('[data-file-fallback] input');
    this.reviewSheet = this.dialog.querySelector('[data-review-sheet]');
    this.saveButton = this.dialog.querySelector('[data-save]');
    this.submitButton = this.dialog.querySelector('[data-submit]');
    this.openSavedButton = this.dialog.querySelector('[data-open-saved]');
    this.generation = 0;
    this.metadataGeneration = 0;
    this.closed = false;
    this.devices = [];
    this.deviceIndex = 0;
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.size = 0;
    this.startedAt = 0;
    this.duration = 0;
    this.streamWidth = 0;
    this.streamHeight = 0;
    this.stopReason = '';
    this.recordTimer = 0;
    this.limitTimer = 0;
    this.reviewUrl = '';
    this.reviewBlob = null;
    this.reviewMeta = null;
    this.savedClip = null;
    this.saved = false;
    this.saving = false;
    this.state = 'idle';
    this.metadataValid = false;
    this.saveToken = 0;
    this.unloadGuardActive = false;
  }

  open() {
    document.body.append(this.dialog);
    this.bind();
    this.dialog.showModal();
    this.dialog.querySelector('[data-close]').focus();
    if (!hasMediaDevices() || !hasRecorder()) this.showUnsupported();
    else void this.startCamera();
  }

  bind() {
    this.dialog.querySelector('[data-close]').addEventListener('click', () => this.requestClose());
    this.guideButton.addEventListener('click', () => this.toggleGuide());
    this.recordButton.addEventListener('click', () => this.startRecording());
    this.stopButton.addEventListener('click', () => this.stopRecording('manual'));
    this.retryButton.addEventListener('click', () => this.startCamera());
    this.flipButton.addEventListener('click', () => this.flipCamera());
    this.zoomButtons.forEach(button => button.addEventListener('click', () => { void this.setZoom(Number(button.dataset.zoom)); }));
    this.dialog.querySelector('[data-retake]').addEventListener('click', () => this.requestRetake());
    this.dialog.querySelector('[data-download]').addEventListener('click', () => this.downloadReview());
    this.saveButton.addEventListener('click', () => this.onSubmit ? this.submitReview() : this.saveReview());
    this.openSavedButton.addEventListener('click', () => {
      if (!this.savedClip?.id) return;
      const clip = this.savedClip;
      this.close(true);
      void import('./local-records.js').then(({ openLocalClip }) => openLocalClip(clip.id));
    });
    this.submitButton.addEventListener('click', () => {
      if (!this.savedClip || !this.isCurrent()) return;
      const clip = this.savedClip;
      this.close(true);
      this.onSubmit?.(clip);
    });
    this.dialog.querySelector('[data-confirm-cancel]').addEventListener('click', () => this.hideConfirm());
    this.dialog.querySelector('[data-confirm-discard]').addEventListener('click', () => {
      if (this.confirmDiscard) this.confirmDiscard();
      else this.close(true);
    });
    this.fileInput.addEventListener('change', () => this.useFallbackFile());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.requestClose(); });
    this.dialog.addEventListener('close', () => this.close(true));
    this.boundKeydown = event => this.onKeydown(event);
    this.boundVisibility = () => this.onVisibilityChange();
    this.boundBeforeUnload = event => {
      event.preventDefault();
      event.returnValue = '';
    };
    this.boundPagehide = () => this.interrupt('pagehide');
    this.boundHash = () => this.interrupt('interrupted');
    document.addEventListener('keydown', this.boundKeydown);
    document.addEventListener('visibilitychange', this.boundVisibility);
    this.boundNativeState = event => { if(event.detail?.isActive===false)this.onVisibilityChange(true); };
    document.addEventListener('native:app-state', this.boundNativeState);
    window.addEventListener('pagehide', this.boundPagehide, { once: true });
    window.addEventListener('hashchange', this.boundHash, { once: true });
  }

  onKeydown(event) {
    if (!this.dialog.open || event.key !== 'Tab') return;
    const controls = [...this.dialog.querySelectorAll('button,[href],input,label[tabindex],video[controls]')].filter(node => !node.hidden && !node.disabled && node.offsetParent !== null);
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async startCamera(preferredDeviceId = '') {
    if (this.recorder?.state === 'recording' || this.state === 'finalizing') return;
    const token = ++this.generation;
    this.clearError();
    this.setState('loading');
    this.stopStream();
    this.clearReview();
    try {
      const constraints = {
        audio: false,
        video: preferredDeviceId
          ? { deviceId: { exact: preferredDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!this.isActive(token)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      this.liveVideo.srcObject = stream;
      this.liveVideo.hidden = false;
      this.reviewStage.hidden = true;
      stream.getTracks().forEach(track => track.addEventListener('ended', () => this.stopRecording('track-ended'), { once: true }));
      await this.liveVideo.play().catch(() => {});
      await this.enumerateDevices();
      if (!this.isActive(token)) return;
      await this.prepareZoom(token);
      if (!this.isActive(token)) return;
      this.setState('ready');
    } catch (error) {
      if (!this.isActive(token)) return;
      this.stopStream();
      this.showError(usefulError(error), true);
      this.setState('error');
    }
  }

  async enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter(device => device.kind === 'videoinput');
      const current = this.stream?.getVideoTracks()[0]?.getSettings?.().deviceId;
      this.deviceIndex = Math.max(0, this.devices.findIndex(device => device.deviceId === current));
      this.flipButton.hidden = this.devices.length <= 1;
    } catch {
      this.devices = [];
      this.flipButton.hidden = true;
    }
  }

  zoomIsCurrent(session) {
    return this.zoomSession === session && this.stream === session.stream &&
      this.isActive(session.token) && session.track.readyState !== 'ended';
  }

  zoomSupported(session, value) {
    const range = session?.range;
    if (!range || value < range.min || value > range.max) return false;
    if (!range.step) return true;
    const steps = (value - range.min) / range.step;
    return Math.abs(steps - Math.round(steps)) < 0.00001;
  }

  readZoom(session) {
    try {
      const value = session.track.getSettings?.().zoom;
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch { return null; }
  }

  async prepareZoom(token) {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    let capability;
    try { capability = track.getCapabilities?.().zoom; } catch {}
    const range = capability && Number.isFinite(capability.min) && Number.isFinite(capability.max) &&
      capability.min > 0 && capability.max >= capability.min &&
      (capability.step === undefined || (Number.isFinite(capability.step) && capability.step > 0)) &&
      typeof track.applyConstraints === 'function' ? capability : null;
    const session = { track, stream: this.stream, token, range, queue: Promise.resolve(), blocked: false, message: '' };
    this.zoomSession = session;
    session.actual = this.readZoom(session);
    this.renderZoom();
    // Safari may open a virtual rear camera at 0.5. Set the requested default on the recording track.
    if (this.zoomSupported(session, 1)) await this.setZoom(1, { initializing: true });
  }

  setZoom(value, { initializing = false } = {}) {
    const session = this.zoomSession;
    if (!session || session.blocked || !this.zoomIsCurrent(session) || !this.zoomSupported(session, value) ||
      (!initializing && !['ready', 'recording'].includes(this.state))) return Promise.resolve();
    session.message = '배율을 변경하고 있어요.';
    this.renderZoom();
    const operation = async () => {
      if (!this.zoomIsCurrent(session) || session.blocked) return;
      let timer;
      let timedOut = false;
      try {
        // Advanced constraints are used by Safari; settings verification catches silently ignored values.
        const existing = session.track.getConstraints?.() || {};
        const { zoom: previousZoom, advanced = [], ...constraints } = existing;
        const preserved = advanced.map(({ zoom: oldZoom, ...other }) => other).filter(item => Object.keys(item).length);
        const applying = Promise.resolve().then(() => {
          if (!this.zoomIsCurrent(session)) return;
          return session.track.applyConstraints({ ...constraints, advanced: [...preserved, { zoom: value }] });
        });
        // A stalled device must not block entering capture. Do not issue another constraint while it may still be running.
        const refreshLateResult = () => {
          if (timedOut && this.zoomIsCurrent(session)) {
            session.actual = this.readZoom(session);
            this.renderZoom();
          }
        };
        applying.then(refreshLateResult, refreshLateResult);
        await Promise.race([applying, new Promise((resolve, reject) => {
          timer = setTimeout(() => { timedOut = true; reject(new Error('zoom-timeout')); }, ZOOM_TIMEOUT_MS);
        })]);
        clearTimeout(timer);
        for (let attempt = 0; attempt < 6; attempt++) {
          if (!this.zoomIsCurrent(session)) return;
          session.actual = this.readZoom(session);
          if (session.actual !== null && Math.abs(session.actual - value) < 0.00001) break;
          if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 60));
        }
        if (!this.zoomIsCurrent(session)) return;
        session.message = session.actual !== null && Math.abs(session.actual - value) < 0.00001
          ? '' : '요청한 배율이 적용되지 않았어요. 현재 배율을 확인해주세요.';
      } catch {
        if (!this.zoomIsCurrent(session)) return;
        session.actual = this.readZoom(session);
        session.blocked = timedOut;
        session.message = timedOut
          ? '배율 응답이 지연돼 변경을 멈췄어요. 현재 화각으로 촬영하거나 카메라를 다시 열어주세요.'
          : '배율을 변경하지 못했어요. 다시 선택해주세요.';
      } finally {
        clearTimeout(timer);
        if (this.zoomIsCurrent(session)) this.renderZoom();
      }
    };
    session.queue = session.queue.then(operation, operation);
    return session.queue;
  }

  renderZoom() {
    if (!this.zoomNode) return;
    const session = this.zoomSession;
    const available = session && this.zoomIsCurrent(session);
    this.zoomNode.hidden = !['ready', 'recording'].includes(this.state);
    this.dialog.dataset.zoom = this.zoomNode.hidden ? 'hidden' : 'visible';
    this.zoomButtons.forEach(button => {
      const value = Number(button.dataset.zoom);
      button.disabled = !available || session.blocked || !this.zoomSupported(session, value);
      const selected = available && (session.actual !== null
        ? Math.abs(session.actual - value) < 0.00001 : !session.range && value === 1);
      button.setAttribute('aria-pressed', String(Boolean(selected)));
      button.title = session?.blocked ? '카메라를 다시 열면 배율을 선택할 수 있어요.'
        : button.disabled ? '이 카메라에서 지원하지 않는 배율입니다.' : `${value}배로 촬영`;
    });
    if (!available) this.zoomStatus.textContent = '카메라 배율을 확인하고 있어요.';
    else if (session.message) this.zoomStatus.textContent = session.message;
    else if (!session.range) this.zoomStatus.textContent = '기본 화각 · 이 기기는 배율 변경을 지원하지 않아요.';
    else this.zoomStatus.textContent = `${session.actual === null ? '현재 배율 확인 불가' : `현재 ${session.actual}×`} · 지원 배율 ${[0.5, 1, 2].filter(value => this.zoomSupported(session, value)).map(value => `${value}×`).join(' / ') || '없음'}`;
  }

  flipCamera() {
    if (this.recorder?.state === 'recording' || this.devices.length <= 1) return;
    this.deviceIndex = (this.deviceIndex + 1) % this.devices.length;
    const next = this.devices[this.deviceIndex]?.deviceId;
    if (next) void this.startCamera(next);
  }

  startRecording() {
    if (this.state !== 'ready' || !this.stream || !hasRecorder() || this.recorder?.state === 'recording') return;
    // Wait for the native landscape lock (or a browser rotation) before encoding.
    if (window.matchMedia?.('(orientation: portrait)').matches) {
      this.showError('휴대폰을 가로로 돌린 뒤 촬영을 시작해주세요.');
      return;
    }
    this.chunks = [];
    this.size = 0;
    this.duration = 0;
    this.stopReason = '';
    this.clearError();
    try {
      this.recorder = this.mimeType ? new MediaRecorder(this.stream, { mimeType: this.mimeType }) : new MediaRecorder(this.stream);
    } catch {
      try { this.recorder = new MediaRecorder(this.stream); }
      catch (error) {
        this.showError(usefulError(error), true);
        this.setState('error');
        return;
      }
    }
    this.mimeType = this.recorder.mimeType || this.mimeType || 'video/webm';
    this.recorder.ondataavailable = event => {
      if (!event.data?.size) return;
      this.chunks.push(event.data);
      this.size += event.data.size;
      if (this.size >= MAX_SIZE) this.stopRecording('size');
    };
    this.recorder.onerror = () => {
      this.showError('녹화가 중단됐어요. 다시 촬영해주세요.', true);
      this.stopRecording('error');
    };
    this.recorder.onstop = () => void this.finalizeRecording();
    this.startedAt = null;
    const recording = this.recorder;
    recording.onstart = () => {
      // Encoder start is asynchronous; startup latency is not recording time.
      if (this.recorder !== recording || recording.state !== 'recording' || this.closed) return;
      this.startedAt = now();
      this.limitTimer = window.setTimeout(() => this.stopRecording('duration'), MAX_DURATION_MS);
      this.recordTimer = window.setInterval(() => this.updateTimer(), 250);
      this.updateTimer();
    };
    this.recorder.start(1000);
    this.setState('recording');
  }

  stopRecording(reason = 'manual') {
    if (this.recorder?.state !== 'recording') return;
    this.stopReason = reason;
    clearTimeout(this.limitTimer);
    clearInterval(this.recordTimer);
    if (this.recorder?.state === 'recording') {
      this.duration = Number.isFinite(this.startedAt) ? Math.max(0, (now() - this.startedAt) / 1000) : 0;
      const settings = this.stream?.getVideoTracks()[0]?.getSettings?.() || {};
      this.streamWidth = this.liveVideo.videoWidth || settings.width || 0;
      this.streamHeight = this.liveVideo.videoHeight || settings.height || 0;
      try { this.recorder.requestData?.(); } catch {}
      try { this.recorder.stop(); } catch { void this.finalizeRecording(); }
      this.setState('finalizing');
      this.stopStream();
    }
  }

  async finalizeRecording() {
    if (this.closed || !this.dialog.open || !this.isCurrent()) return;
    const token = this.metadataGeneration = (this.metadataGeneration || 0) + 1;
    clearTimeout(this.limitTimer);
    clearInterval(this.recordTimer);
    this.stopStream();
    if (!this.chunks.length) {
      this.showError('저장할 녹화 데이터가 없어요. 다시 촬영해주세요.', true);
      this.setState('error');
      return;
    }
    const blob = new Blob(this.chunks, { type: this.mimeType || 'video/webm' });
    const width = this.streamWidth || this.liveVideo.videoWidth || 0;
    const height = this.streamHeight || this.liveVideo.videoHeight || 0;
    try {
      const details = await inspectVideo(blob);
      if (!this.isMetadataCurrent(token)) return;
      this.showReview(blob, details, { metadataValid: true });
    } catch (error) {
      if (!this.isMetadataCurrent(token)) return;
      this.showReview(blob, { duration: this.duration, width, height }, { metadataValid: false });
      this.showError(error.message, true);
    }
  }

  async useFallbackFile() {
    if (this.closed || !this.dialog.open || !this.isCurrent()) return;
    const token = this.metadataGeneration = (this.metadataGeneration || 0) + 1;
    const file = this.fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/') || file.size > MAX_SIZE) {
      this.showError('250 MB 이하의 동영상 파일만 보관할 수 있어요.', true);
      return;
    }
    try {
      const details = await inspectVideo(file);
      if (!this.isMetadataCurrent(token)) return;
      assertVideoDuration(details.duration);
      this.mimeType = file.type || 'video/mp4';
      this.showReview(file, details, { metadataValid: true });
    } catch (error) {
      if (this.isMetadataCurrent(token)) this.showError(error.message, true);
    }
  }

  isMetadataCurrent(token) {
    return !this.closed && this.dialog.open && this.isCurrent() && this.metadataGeneration === token;
  }

  showReview(blob, details, { metadataValid = true } = {}) {
    const validDetails = metadataValid && Number.isFinite(details.duration) && details.duration > 0 && details.width > 0 && details.height > 0;
    this.reviewBlob = blob;
    this.metadataValid = validDetails;
    this.reviewMeta = {
      duration: details.duration || this.duration || 0,
      width: details.width || 0,
      height: details.height || 0,
      size: blob.size,
      mimeType: blob.type || this.mimeType || 'video/webm',
    };
    if (this.reviewUrl) URL.revokeObjectURL(this.reviewUrl);
    this.reviewUrl = URL.createObjectURL(blob);
    this.reviewVideo.src = this.reviewUrl;
    this.reviewStage.hidden = false;
    this.liveVideo.hidden = true;
    this.reviewSheet.hidden = false;
    this.dialog.querySelector('[data-meta]').textContent = `${formatDuration(this.reviewMeta.duration)} · ${this.reviewMeta.width || '-'} × ${this.reviewMeta.height || '-'} · ${formatBytes(blob.size)}`;
    if (blob.size > MAX_SIZE) this.showError('영상이 250 MB를 넘었어요. 다운로드로 보관하거나 다시 촬영해주세요.', true);
    else if (this.stopReason === 'duration') this.showError('1분 촬영을 마쳤어요. 영상을 확인한 뒤 제출해주세요.');
    else if (this.stopReason === 'hidden') this.showError('화면이 숨겨져 녹화를 마쳤어요. 촬영분은 아래에서 확인할 수 있습니다.');
    else if (this.stopReason === 'track-ended') this.showError('카메라 연결이 종료되어 녹화를 마쳤어요. 촬영분은 아래에서 확인할 수 있습니다.');
    this.setState('review');
    const durationError = videoDurationError(this.reviewMeta.duration);
    if (validDetails && durationError) {
      this.saveButton.disabled = true;
      this.submitButton.hidden = true;
      this.setSaveStatus(durationError + ' 다운로드하거나 다시 촬영해주세요.', true);
    }
    if (!validDetails) {
      this.saveButton.hidden = true;
      this.saveButton.disabled = true;
      this.submitButton.hidden = true;
      this.setSaveStatus('영상 정보를 읽지 못해 저장할 수 없어요. 다운로드하거나 다시 촬영해주세요.', true);
    }
  }

  async submitReview() {
    if (this.submitting || !this.reviewBlob || !this.reviewMeta || !this.isCurrent()) return;
    const error = !this.metadataValid ? '영상 정보를 확인하지 못했어요. 다시 촬영해주세요.'
      : videoDurationError(this.reviewMeta.duration) || (this.reviewBlob.size > MAX_SIZE ? '250 MB 이하 영상만 제출할 수 있어요.' : '');
    if (error) { this.setSaveStatus(error, true); return; }
    const blob = this.reviewBlob;
    const isCurrent = () => !this.closed && this.dialog.open && this.reviewBlob === blob && this.isCurrent();
    this.submitting = true;
    this.saveButton.disabled = true;
    this.setSaveStatus('제출 화면을 준비하고 있어요...');
    try {
      const accepted = await this.onSubmit({
        id: 'camera-pending', blob, title: safeTitle(this.activity),
        activityId: safeActivityId(this.activity), duration: this.reviewMeta.duration,
      }, { isCurrent });
      if (!isCurrent()) {
        if (!this.closed && this.dialog.open) this.setSaveStatus('계정이나 영상이 바뀌었어요. 다시 열어 제출해주세요.', true);
        return;
      }
      if (accepted === true) this.close(true);
      else this.setSaveStatus('제출 화면을 열지 못했어요. 다시 시도해주세요.', true);
    } catch (error) {
      if (isCurrent()) this.setSaveStatus(error?.message || '제출 화면을 열지 못했어요. 다시 시도해주세요.', true);
    } finally {
      this.submitting = false;
      this.saveButton.disabled = false;
    }
  }

  async saveReview() {
    if (this.saving || this.saved || !this.reviewBlob || !this.reviewMeta) return;
    if (!this.metadataValid) {
      this.setSaveStatus('영상 정보를 읽지 못해 저장할 수 없어요. 다운로드하거나 다시 촬영해주세요.', true);
      return;
    }
    const durationError = videoDurationError(this.reviewMeta.duration);
    if (durationError) { this.setSaveStatus(durationError, true); return; }
    if (this.reviewBlob.size > MAX_SIZE) {
      this.setSaveStatus('250 MB 이하 영상만 저장할 수 있어요. 다운로드 후 다시 촬영해주세요.', true);
      return;
    }
    if (!this.isCurrent()) {
      this.setSaveStatus('현재 계정이나 화면 상태가 바뀌었어요. 다시 열어 저장해주세요.', true);
      return;
    }
    this.saving = true;
    const token = ++this.saveToken;
    this.saveButton.disabled = true;
    this.setSaveStatus('이 브라우저에 저장하고 있어요...');
    try {
      const activityId = safeActivityId(this.activity);
      const saved = await saveClip({
        activityId,
        missionId: activityId,
        title: safeTitle(this.activity),
        category: safeCategory(this.activity),
        duration: this.reviewMeta.duration,
        width: this.reviewMeta.width,
        height: this.reviewMeta.height,
        size: this.reviewBlob.size,
        mimeType: this.reviewMeta.mimeType,
        blob: this.reviewBlob,
        status: 'draft',
        source: 'camera',
        example: false,
        notes: '',
      });
      if (token !== this.saveToken || !this.dialog.open || !this.isCurrent()) {
        try { await deleteClip(saved.id); } catch (error) { console.error(error); }
        this.setSaveStatus('계정 상태가 바뀌어 저장을 취소했어요. 다시 열어 저장해주세요.', true);
        return;
      }
      this.saved = true;
      this.savedClip = saved;
      this.setSaveStatus('저장했습니다. 보관함에서 다시 볼 수 있어요.');
      this.openSavedButton.hidden = false;
      this.submitButton.hidden = !this.onSubmit;
      this.saveButton.textContent = '저장 완료';
      this.saveButton.disabled = true;
      this.setState('saved');
      try { this.onSaved(saved); } catch (error) { console.error(error); }
    } catch (error) {
      this.saveButton.disabled = false;
      this.setSaveStatus(error?.message || '저장하지 못했어요. 저장 공간과 브라우저 설정을 확인해주세요.', true);
    } finally {
      this.saving = false;
    }
  }

  requestRetake() {
    if (this.reviewBlob && !this.saved) {
      this.showConfirm(() => {
        this.hideConfirm();
        this.clearReview();
        void this.startCamera();
      }, '버리고 다시 촬영');
      return;
    }
    this.clearReview();
    void this.startCamera();
  }

  requestClose() {
    if (this.state === 'finalizing' || (this.reviewBlob && !this.saved) || this.recorder?.state === 'recording') {
      this.showConfirm(() => this.close(true), '버리고 닫기');
      return;
    }
    this.close(true);
  }

  showConfirm(onDiscard, discardLabel = '버리고 닫기') {
    this.confirmDiscard = onDiscard;
    const confirm = this.dialog.querySelector('[data-confirm]');
    confirm.querySelector('[data-confirm-discard]').textContent = discardLabel;
    confirm.hidden = false;
    confirm.querySelector('[data-confirm-cancel]').focus();
  }

  hideConfirm() {
    this.dialog.querySelector('[data-confirm]').hidden = true;
    this.confirmDiscard = null;
  }

  showUnsupported() {
    const unsupported = !hasMediaDevices()
      ? '이 브라우저는 웹 카메라 촬영을 지원하지 않아요. 휴대폰에서는 아래 버튼으로 카메라 촬영 파일을 만들 수 있습니다.'
      : '이 브라우저는 녹화 기능을 지원하지 않아요. 휴대폰 카메라 촬영 파일로 보관할 수 있습니다.';
    this.showError(unsupported, true);
    this.setState('fallback');
  }

  setState(state) {
    this.state = state;
    this.renderZoom();
    this.dialog.dataset.state = state;
    const processing = this.dialog.querySelector('[data-processing-heading]');
    processing.hidden = state !== 'finalizing';
    const mascot = processing.querySelector('[data-processing-mascot]');
    if (state === 'finalizing' && !mascot.firstElementChild) mascot.innerHTML = mascotMotion('processing');
    else if (state !== 'finalizing') mascot.replaceChildren();
    this.recordButton.hidden = state !== 'ready';
    this.stopButton.hidden = state !== 'recording';
    this.retryButton.hidden = !['error', 'fallback'].includes(state) || !hasMediaDevices() || !hasRecorder();
    this.timerNode.hidden = state !== 'recording';
    this.reviewSheet.hidden = state !== 'review' && state !== 'saved';
    this.flipButton.disabled = state === 'recording' || state === 'loading';
    this.guideButton.hidden = state === 'recording';
    this.guideButton.disabled = state === 'recording';
    this.dialog.querySelector('[data-guide]').hidden = state === 'recording' || state === 'review' || state === 'saved';
    const messages = {
      loading: '카메라 권한을 확인하고 있어요.',
      ready: '준비됐습니다. 가운데 버튼을 누르면 녹화가 시작돼요.',
      recording: '녹화 중입니다.',
      finalizing: '촬영한 영상을 준비하고 있어요.',
      review: '촬영한 영상을 확인해주세요.',
      saved: '저장했습니다.',
      error: '다시 시도하거나 파일 촬영을 사용할 수 있어요.',
      fallback: '파일 촬영으로 보관할 수 있어요.',
    };
    this.statusNode.textContent = messages[state] || '';
    this.refreshUnloadGuard();
  }

  updateTimer() {
    const actualElapsed = Math.max(0, now() - this.startedAt);
    const elapsed = Math.min(TARGET_DURATION_MS, actualElapsed);
    if (actualElapsed >= MAX_DURATION_MS && this.recorder?.state === 'recording') this.stopRecording('duration');
    const seconds = Math.floor(elapsed / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    this.timerNode.querySelector('span').textContent = `${mm}:${ss}`;
  }

  setSaveStatus(message, error = false) {
    const node = this.dialog.querySelector('[data-save-status]');
    node.textContent = message;
    node.classList.toggle('is-error', error);
    if (message) this.statusNode.textContent = message;
  }

  showError(message, error = false) {
    this.errorNode.hidden = !message;
    this.errorNode.textContent = message || '';
    this.errorNode.classList.toggle('is-error', error);
  }

  clearError() {
    this.showError('');
  }

  refreshUnloadGuard() {
    const shouldProtect = !this.closed && (this.recorder?.state === 'recording' || this.state === 'finalizing' || (this.reviewBlob && !this.saved));
    if (shouldProtect && !this.unloadGuardActive) {
      window.addEventListener('beforeunload', this.boundBeforeUnload);
      this.unloadGuardActive = true;
    } else if (!shouldProtect && this.unloadGuardActive) {
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      this.unloadGuardActive = false;
    }
  }

  toggleGuide() {
    if (this.state === 'recording') return;
    const guide = this.dialog.querySelector('[data-guide]');
    guide.hidden = !guide.hidden;
  }

  clearReview() {
    this.metadataGeneration = (this.metadataGeneration || 0) + 1;
    this.saved = false;
    this.savedClip = null;
    this.reviewBlob = null;
    this.reviewMeta = null;
    this.metadataValid = false;
    this.reviewSheet.hidden = true;
    this.reviewStage.hidden = true;
    this.reviewVideo.removeAttribute('src');
    this.reviewVideo.load();
    if (this.reviewUrl) URL.revokeObjectURL(this.reviewUrl);
    this.reviewUrl = '';
    this.openSavedButton.hidden = true;
    this.submitButton.hidden = true;
    this.saveButton.hidden = false;
    this.saveButton.disabled = false;
    this.saveButton.textContent = this.onSubmit ? '제출 계속하기' : '이 브라우저에 저장';
    this.setSaveStatus('');
    this.refreshUnloadGuard();
  }

  async downloadReview() {
    if (!this.reviewUrl || this.nativeSharing) return;
    if (isNativeApp()) {
      this.nativeSharing = true;
      const button = this.dialog.querySelector('[data-download]');
      button.disabled = true;
      this.setSaveStatus('파일을 준비하고 있습니다.');
      try { await shareNativeBlob(this.reviewBlob, fileNameFor(safeTitle(this.activity), this.reviewMeta?.mimeType)); this.setSaveStatus(''); }
      catch (error) { this.setSaveStatus(error.message || '파일을 공유하지 못했습니다.'); }
      finally { this.nativeSharing = false; if(button.isConnected)button.disabled = false; }
      return;
    }
    const link = document.createElement('a');
    link.href = this.reviewUrl;
    link.download = fileNameFor(safeTitle(this.activity), this.reviewMeta?.mimeType);
    document.body.append(link);
    link.click();
    link.remove();
  }

  isActive(token) {
    return !this.closed && !document.hidden && this.dialog.open && this.generation === token && this.isCurrent();
  }

  onVisibilityChange(nativeBackground = false) {
    if (this.closed || (!document.hidden && !nativeBackground)) return;
    if (this.state === 'finalizing') return;
    if (this.recorder?.state === 'recording') {
      this.stopRecording('hidden');
      return;
    }
    this.generation++;
    this.stopStream();
    if (!this.reviewBlob && !this.saved) {
      this.showError('화면이 숨겨져 카메라를 껐어요. 다시 시도해주세요.');
      this.setState('error');
    }
  }

  stopStream() {
    this.zoomSession = null;
    this.renderZoom();
    const stream = this.stream;
    this.stream = null;
    if (stream) stream.getTracks().forEach(track => track.stop());
    this.liveVideo.srcObject = null;
  }

  interrupt(reason = 'interrupted') {
    if (this.closed) return;
    if (this.state === 'finalizing') return;
    if (this.recorder?.state === 'recording') {
      if (!this.isCurrent()) {
        this.close(true);
        return;
      }
      this.showError('화면 전환으로 녹화를 마쳤어요. 촬영분은 확인 후 제출할 수 있습니다.');
      this.stopRecording(reason);
      return;
    }
    if (this.reviewBlob && !this.saved) {
      this.showError('화면 전환이 감지됐어요. 촬영분은 제출하거나 다시 촬영할 수 있습니다.');
      return;
    }
    this.close(true);
  }

  close(force = false) {
    if (this.closed) return;
    if (!force) return this.requestClose();
    this.closed = true;
    this.generation++;
    clearTimeout(this.limitTimer);
    clearInterval(this.recordTimer);
    if (this.recorder?.state === 'recording') {
      this.recorder.onstart = this.recorder.onstop = null;
      try { this.recorder.stop(); } catch {}
    }
    this.stopStream();
    this.clearReview();
    document.removeEventListener('keydown', this.boundKeydown);
    document.removeEventListener('visibilitychange', this.boundVisibility);
    document.removeEventListener('native:app-state', this.boundNativeState);
    window.removeEventListener('beforeunload', this.boundBeforeUnload);
    this.unloadGuardActive = false;
    window.removeEventListener('pagehide', this.boundPagehide);
    window.removeEventListener('hashchange', this.boundHash);
    if (this.dialog.open) this.dialog.close();
    this.dialog.remove();
    if (activeCamera === this) activeCamera = null;
    this.trigger?.focus?.({ preventScroll: true });
  }
}

export function openStudioCamera(options = {}) {
  activeCamera?.close(true);
  activeCamera = new StudioCamera(options);
  activeCamera.open();
  return activeCamera.dialog;
}

export function interruptStudioCamera(reason = 'interrupted') {
  activeCamera?.interrupt(reason);
}

export function closeStudioCamera({ preserve = false } = {}) {
  if (preserve) activeCamera?.interrupt('interrupted');
  else activeCamera?.close(true);
}
