import { activities, examples, exampleFor, activityFor } from './catalog.js';

const capturePlanKey = 'momjit-studio-capture-plan-v1';
const capturePlanVersion = 1;
const trainingKey = 'momjit-studio-training-v1';
const trainingVersion = 1;
const preflightKeys = ['headgear', 'landscape', 'fiveMinutes', 'privacy'];
const trainingAnswers = { q1: 'landscape', q2: 'privacy', q3: 'natural' };
const trainingOptions = {
  q1: ['landscape', 'portrait'],
  q2: ['tools', 'privacy'],
  q3: ['natural', 'acting'],
};
const listeners = new Set();
const knownActivityIds = new Set(activities.map(item => item.id));
const knownExampleIds = new Set(examples.map(item => item.id));

let memoryPlan = defaultPlan();
let memoryTraining = defaultTraining();
let planBroken = false;
let trainingBroken = false;

function defaultPlan() {
  return { version: capturePlanVersion, saved: [], selected: '' };
}

function defaultTraining() {
  return { version: trainingVersion, example: 'dishwashing', answers: {}, completed: false, preflight: {} };
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function parsePlan(raw) {
  if (!raw) return defaultPlan();
  const parsed = JSON.parse(raw);
  if (
    !parsed ||
    parsed.version !== capturePlanVersion ||
    !Array.isArray(parsed.saved) ||
    parsed.saved.some(id => typeof id !== 'string' || !knownActivityIds.has(id)) ||
    typeof parsed.selected !== 'string' ||
    (parsed.selected !== '' && !knownActivityIds.has(parsed.selected))
  ) throw new Error('Invalid capture plan');
  return {
    version: capturePlanVersion,
    saved: [...new Set(parsed.saved)],
    selected: parsed.selected || '',
  };
}

function parseTraining(raw) {
  if (!raw) return defaultTraining();
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.version !== trainingVersion || !knownExampleIds.has(parsed.example)) throw new Error('Invalid training');
  const answers = {};
  for (const [key, values] of Object.entries(trainingOptions)) {
    if (values.includes(parsed.answers?.[key])) answers[key] = parsed.answers[key];
  }
  const preflight = {};
  for (const key of preflightKeys) {
    if (parsed.preflight?.[key] === true) preflight[key] = true;
  }
  return {
    version: trainingVersion,
    example: parsed.example,
    answers,
    completed: parsed.completed === true,
    preflight,
  };
}

function readPlan() {
  if (planBroken) return memoryPlan;
  const store = storage();
  if (!store) {
    planBroken = true;
    return memoryPlan;
  }
  try {
    memoryPlan = parsePlan(store.getItem(capturePlanKey));
    return memoryPlan;
  } catch {
    planBroken = true;
    memoryPlan = defaultPlan();
    return memoryPlan;
  }
}

function readTraining() {
  if (trainingBroken) return memoryTraining;
  const store = storage();
  if (!store) {
    trainingBroken = true;
    return memoryTraining;
  }
  try {
    memoryTraining = parseTraining(store.getItem(trainingKey));
    return memoryTraining;
  } catch {
    trainingBroken = true;
    memoryTraining = defaultTraining();
    return memoryTraining;
  }
}

function writePlan(next) {
  const base = readPlan();
  const selected = next.selected ?? base.selected;
  memoryPlan = {
    version: capturePlanVersion,
    saved: [...new Set((next.saved ?? base.saved).filter(id => knownActivityIds.has(id)))],
    selected: knownActivityIds.has(selected) ? selected : '',
  };
  if (planBroken) return false;
  try {
    storage()?.setItem(capturePlanKey, JSON.stringify(memoryPlan));
    return true;
  } catch {
    planBroken = true;
    return false;
  }
}

function writeTraining(next) {
  const base = readTraining();
  const example = next.example ?? base.example;
  memoryTraining = {
    version: trainingVersion,
    example: knownExampleIds.has(example) ? example : defaultTraining().example,
    answers: next.answers ?? base.answers,
    completed: next.completed ?? base.completed,
    preflight: next.preflight ?? base.preflight,
  };
  if (trainingBroken) return false;
  try {
    storage()?.setItem(trainingKey, JSON.stringify(memoryTraining));
    return true;
  } catch {
    trainingBroken = true;
    return false;
  }
}

function notify() {
  for (const listener of listeners) listener(getPreparationState());
}

function trainingDone(training = readTraining()) {
  return Object.entries(trainingAnswers).every(([key, value]) => training.answers[key] === value);
}

function preflightCount(training = readTraining()) {
  return preflightKeys.filter(key => training.preflight[key]).length;
}

function selectedActivity(plan = readPlan()) {
  return activityFor(plan.selected) || null;
}

function exampleIdForActivity(id, fallback = readTraining().example) {
  return exampleFor(activityFor(id))?.id || fallback;
}

function noticeText() {
  if (planBroken && trainingBroken) return '촬영 준비 저장값을 읽지 못해 현재 화면에서만 유지돼요. 기존 저장값은 변경하지 않아요.';
  if (planBroken) return '활동 저장값을 읽지 못해 현재 화면에서만 유지돼요. 기존 저장값은 변경하지 않아요.';
  if (trainingBroken) return '촬영 교육 저장값을 읽지 못해 현재 화면에서만 유지돼요. 기존 저장값은 변경하지 않아요.';
  return '';
}

function fallbackEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function defaultIcon(name) {
  return `<span class="app-icon" style="--icon:url('./icons/phosphor/${fallbackEsc(name)}.svg')" aria-hidden="true"></span>`;
}

function exampleCard(example, active, icon, esc) {
  return `<button type="button" class="prep-example-card" data-prep-action="example" data-prep-example="${esc(example.id)}" aria-pressed="${active}">
    <img src="${esc(example.poster)}" width="320" height="180" loading="lazy" alt="">
    <span><strong>${esc(example.label)}</strong><small>${esc(example.note)}</small></span>
    ${active ? `<b>${icon('check-circle')}선택됨</b>` : ''}
  </button>`;
}

function quizMarkup(training, icon, esc) {
  const questions = [
    ['q1', '촬영 방향은 무엇이 기준인가요?', [['landscape', '가로 화면으로 촬영'], ['portrait', '세로 화면으로 촬영']]],
    ['q2', '촬영 전 화면에서 먼저 치워야 하는 것은?', [['tools', '작업에 쓰는 식기와 옷'], ['privacy', '얼굴, 주소, 신분증 같은 개인정보']]],
    ['q3', '집안일 동작은 어떻게 해야 하나요?', [['natural', '평소처럼 자연스러운 속도로 진행'], ['acting', '카메라를 향해 과장해서 반복']]],
  ];
  const correct = trainingDone(training);
  const done = training.completed === true && correct;
  return `<section class="prep-panel prep-quiz" aria-labelledby="prep-quiz-title">
    <div class="prep-panel-head"><span class="row-icon mint">${icon('shield-check')}</span><div><h2 id="prep-quiz-title">촬영 기준 확인</h2><p>${done ? '교육 확인이 완료됐어요.' : '3개 문항에 답한 뒤 완료를 눌러주세요.'}</p></div></div>
    ${questions.map(([id, title, options]) => `<fieldset class="prep-question"><legend>${esc(title)}</legend>${options.map(([value, label]) => {
      const selected = training.answers[id] === value;
      const correct = trainingAnswers[id] === value;
      return `<button type="button" data-prep-action="answer" data-prep-question="${id}" data-prep-answer="${value}" aria-pressed="${selected}" class="${selected && correct ? 'is-correct' : selected ? 'is-wrong' : ''}">${esc(label)}</button>`;
    }).join('')}<p class="prep-feedback" role="status">${training.answers[id] ? training.answers[id] === trainingAnswers[id] ? '정답입니다.' : '촬영 기준을 다시 확인해주세요.' : ''}</p></fieldset>`).join('')}
    <div class="prep-complete-row">
      <button type="button" class="app-button primary" data-prep-action="complete-training">${done ? '교육 완료' : '교육 완료 확인'} ${icon('check-circle')}</button>
      <span class="prep-state ${done ? 'is-done' : ''}" role="status">${done ? `${icon('check-circle')}촬영 전 점검을 진행해주세요.` : correct ? `${icon('question')}완료를 눌러 준비 상태에 반영해요.` : `${icon('question')}아직 확인이 끝나지 않았어요.`}</span>
    </div>
  </section>`;
}

function preflightMarkup(training, activity, icon, esc) {
  const checks = [
    ['headgear', '카메라가 양손과 작업 대상을 함께 담는 위치에 있어요.'],
    ['landscape', '가로 화면으로 촬영할 준비가 됐어요.'],
    ['fiveMinutes', '약 5분 동안 평소 속도로 촬영할 수 있어요.'],
    ['privacy', '얼굴, 주소, 문서, 차량번호 같은 개인정보를 치웠어요.'],
  ];
  const count = preflightCount(training);
  return `<section class="prep-panel prep-preflight" aria-labelledby="prep-preflight-title">
    <div class="prep-panel-head"><span class="row-icon cyan">${icon('camera')}</span><div><h2 id="prep-preflight-title">촬영 전 체크</h2><p>${activity ? `${esc(activity.title)} 촬영 전 확인 ${count}/4` : '활동을 선택하면 체크를 시작할 수 있어요.'}</p></div></div>
    ${checks.map(([id, label]) => `<label><input type="checkbox" data-prep-check="${id}" ${training.preflight[id] ? 'checked' : ''} ${activity ? '' : 'disabled'}>${esc(label)}</label>`).join('')}
    <div class="prep-actions">
      <a class="app-button secondary" href="#library">${icon('video-camera')}보관함</a>
      <a class="app-button secondary" href="#reviews">${icon('cloud-check')}심사</a>
      <button type="button" class="app-button secondary" data-prep-action="reset-preflight" ${count ? '' : 'disabled'}>점검 초기화</button>
      ${activity ? `<a class="app-button primary" href="#guide/${encodeURIComponent(activity.id)}/1">${icon('arrow-right')}가이드로 촬영</a>` : '<a class="app-button primary" href="#missions">활동 고르기</a>'}
    </div>
    <p class="muted-caption">이 확인은 촬영 준비용입니다. 영상 제출 동의와 심사 승인은 제출 단계에서 별도로 진행돼요.</p>
  </section>`;
}

function activityCard(activity, plan, icon, esc) {
  const saved = plan.saved.includes(activity.id);
  const selected = plan.selected === activity.id;
  const sample = exampleFor(activity);
  return `<article class="prep-activity-card ${selected ? 'is-selected' : ''}">
    <button type="button" class="prep-activity-main" data-prep-action="select" data-prep-id="${esc(activity.id)}" aria-pressed="${selected}">
      ${sample ? `<img src="${esc(sample.poster)}" width="124" height="90" loading="lazy" alt="">` : `<span class="prep-activity-icon">${icon('camera')}</span>`}
      <span><small>${esc(activity.category)}</small><strong>${esc(activity.title)}</strong><em>${esc(activity.description)}</em></span>
    </button>
    <button type="button" class="prep-save" data-prep-action="save" data-prep-id="${esc(activity.id)}" aria-label="${esc(activity.title)} 저장" aria-pressed="${saved}">${icon(saved ? 'check-circle' : 'plus')}</button>
  </article>`;
}

export function getPreparationState() {
  const plan = readPlan();
  const training = readTraining();
  return {
    plan: { saved: [...plan.saved], selected: plan.selected },
    training: {
      example: training.example,
      answers: { ...training.answers },
      completed: training.completed === true && trainingDone(training),
      preflight: { ...training.preflight },
    },
    notice: noticeText(),
  };
}

export function subscribePreparation(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toggleSavedActivity(id) {
  if (!knownActivityIds.has(id)) return false;
  const plan = readPlan();
  const saved = plan.saved.includes(id) ? plan.saved.filter(item => item !== id) : [...plan.saved, id];
  writePlan({ saved });
  notify();
  return true;
}

export function selectPreparationActivity(id) {
  if (!knownActivityIds.has(id)) return false;
  writePlan({ selected: id });
  writeTraining({ example: exampleIdForActivity(id), preflight: {} });
  notify();
  return true;
}

export function renderEducation(options = {}) {
  const icon = options.icon || defaultIcon;
  const esc = options.esc || fallbackEsc;
  const state = getPreparationState();
  const activity = selectedActivity({ version: capturePlanVersion, saved: state.plan.saved, selected: state.plan.selected });
  const activeExample = examples.find(item => item.id === state.training.example) || examples[0];
  const complete = state.training.completed && preflightCount(state.training) === preflightKeys.length && activity;
  return `<section class="app-education">
    <div class="screen-heading">
      <span class="step-chip">촬영 준비</span>
      <h1>촬영 전에 함께 확인해요</h1>
      <p>예시 영상을 보고 활동을 고른 뒤, 촬영 기준과 마지막 점검을 차례로 확인해요.</p>
    </div>
    ${state.notice ? `<div class="app-alert" role="status">${esc(state.notice)}</div>` : ''}
    <section class="prep-status ${complete ? 'is-complete' : ''}">
      <span class="row-icon navy">${icon(complete ? 'check-circle' : 'video-camera')}</span>
      <div><strong>${complete ? '촬영 준비 완료' : activity ? `${esc(activity.title)} 준비 중` : '촬영 활동을 선택해 주세요'}</strong><small>${activity ? `교육 ${state.training.completed ? '완료' : '확인 필요'} · 촬영 전 확인 ${preflightCount(state.training)}/4` : '아래 활동 중 하나를 누르면 준비가 시작돼요.'}</small></div>
    </section>
    <section class="prep-panel" aria-labelledby="prep-activity-title">
      <div class="prep-panel-head"><span class="row-icon lavender">${icon('squares-four')}</span><div><h2 id="prep-activity-title">촬영 활동 준비</h2><p>선택하면 해당 예시로 교육 화면이 맞춰지고 촬영 전 체크가 새로 시작돼요.</p></div></div>
      <div class="prep-activity-list">${activities.map(item => activityCard(item, state.plan, icon, esc)).join('')}</div>
    </section>
    <section class="prep-panel" aria-labelledby="prep-example-title">
      <div class="prep-panel-head"><span class="row-icon peach">${icon('play')}</span><div><h2 id="prep-example-title">예시 영상으로 구도 확인</h2><p>${esc(activeExample.title)} · ${esc(activeExample.note)}</p></div></div>
      <button type="button" class="prep-sample-play app-button secondary" data-app-action="sample" data-example="${esc(activeExample.id)}">${icon('play')}예시 영상 재생</button>
      <div class="prep-examples">${examples.map(example => exampleCard(example, example.id === activeExample.id, icon, esc)).join('')}</div>
    </section>
    ${quizMarkup(state.training, icon, esc)}
    ${preflightMarkup(state.training, activity, icon, esc)}
    <section class="prep-faq">
      <details><summary>촬영 활동을 고르면 바로 신청되나요?</summary><p>활동 선택은 촬영할 내용을 정하는 단계입니다. 저장한 영상은 동의 내용을 확인하고 심사 제출하기를 눌러야 접수됩니다.</p></details>
      <details><summary>영상은 어디에 저장되고, 어떻게 제출하나요?</summary><p>촬영하거나 가져온 영상은 현재 기기에 먼저 저장되며 자동 제출되지 않습니다. 보관함에서 영상을 확인한 뒤 직접 제출하세요.</p></details>
      <details><summary>포인트는 어떻게 적립되나요?</summary><p>한국에서 촬영한 약 5분의 집안일 영상이 검수 기준을 통과하면 포인트가 적립됩니다. 제출만으로는 적립되지 않습니다.</p></details>
      <details><summary>촬영 전 체크가 제출 동의인가요?</summary><p>아니요. 체크는 촬영 품질을 위한 준비 상태입니다. 영상 제출과 데이터 이용 동의는 제출 단계에서 다시 확인해요.</p></details>
    </section>
  </section>`;
}

export function handlePreparationClick(target) {
  const actionTarget = target?.closest?.('[data-prep-action]');
  if (!actionTarget) return { handled: false };
  const action = actionTarget.dataset.prepAction;
  let handled = true;
  if (action === 'save') toggleSavedActivity(actionTarget.dataset.prepId);
  else if (action === 'select') selectPreparationActivity(actionTarget.dataset.prepId);
  else if (action === 'example') {
    const id = actionTarget.dataset.prepExample;
    if (!knownExampleIds.has(id)) return { handled: true, message: '예시 영상을 찾지 못했어요.' };
    writeTraining({ example: id });
    notify();
  } else if (action === 'answer') {
    const key = actionTarget.dataset.prepQuestion;
    const answer = actionTarget.dataset.prepAnswer;
    const training = readTraining();
    if (!trainingOptions[key]?.includes(answer)) return { handled: true };
    const answers = { ...training.answers, [key]: answer };
    writeTraining({ answers, completed: false });
    notify();
  } else if (action === 'complete-training') {
    const training = readTraining();
    if (!trainingDone(training)) return { handled: true, message: '3개 문항을 모두 맞춘 뒤 완료할 수 있어요.' };
    writeTraining({ completed: true });
    notify();
  } else if (action === 'reset-preflight') {
    writeTraining({ preflight: {} });
    notify();
  } else handled = false;
  return { handled, message: handled ? undefined : '' };
}

export function handlePreparationChange(target) {
  if (!target?.matches?.('[data-prep-check]')) return false;
  const key = target.dataset.prepCheck;
  if (!preflightKeys.includes(key)) return true;
  const training = readTraining();
  const preflight = { ...training.preflight };
  if (target.checked) preflight[key] = true;
  else delete preflight[key];
  writeTraining({ preflight });
  notify();
  return true;
}

if (typeof addEventListener === 'function') {
  addEventListener('storage', event => {
    if (event.storageArea && event.storageArea !== storage()) return;
    if (![capturePlanKey, trainingKey, null].includes(event.key)) return;
    if (event.key === capturePlanKey || event.key === null) planBroken = false;
    if (event.key === trainingKey || event.key === null) trainingBroken = false;
    readPlan();
    readTraining();
    notify();
  });
}
