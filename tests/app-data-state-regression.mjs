import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
import { VIDEO_TARGET_SECONDS } from '../shared/video-policy.js';

let app = new URL('../mobile/overlays/ios-ego/app/', import.meta.url);
try { await access(new URL('app.js', app)); } catch { app = new URL('../app/', import.meta.url); }
const source = await readFile(new URL('app.js', app), 'utf8');
const experience = await readFile(new URL('experience-ui.js', app), 'utf8');
const line = name => source.split('\n').find(value => value.startsWith('function ' + name + '('));
const fixture = () => {
  const output = { innerHTML: '' };
  const ui = { estimateCount: 3, estimateActivity: 'a', libraryQuery: '', libraryStatus: 'all', librarySort: 'newest' };
  const context = vm.createContext({
    ui, VIDEO_TARGET_SECONDS, document: { querySelector: () => output },
    selectedTask: () => ({ reward: 1000 }), reward: task => task.reward,
    tasks: () => [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
    points: value => value + 'P', esc: value => String(value ?? '').replaceAll('"', '&quot;'),
    icon: () => '', size: value => value + 'B', stamp: String, duration: String,
    statusNames: {}, empty: (title, copy, action = '') => title + copy + action,
    button: (label, action) => '<button data-app-action="' + action + '">' + label + '</button>',
    loadingScreen: (title, copy) => '<section role="status">' + title + copy + '</section>'
  });
  vm.runInContext(experience.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''),context);
  vm.runInContext(['estimateValue', 'estimateMarkup', 'updateEstimate', 'estimate', 'loadingPrivate'].map(line).join('\n'), context);
  const input = source.split('\n').find(value => value.includes("if(event.target.id==='app-estimate-count')"));
  const change = source.split('\n').find(value => value.includes("if(event.target.id==='app-estimate-activity')"));
  vm.runInContext('function input(event){' + input + '}\nfunction change(event){' + change + '}', context);
  return { context, ui, output };
};

test('estimate filming time follows the current recording policy', () => {
  const { context } = fixture();
  assert.match(context.estimateValue(), new RegExp('촬영 약 ' + 3 * VIDEO_TARGET_SECONDS / 60 + '분'));
});

test('invalid estimate input remains invalid after activity changes and rerenders', () => {
  for (const value of ['', '0', '1.5', '21']) {
    const { context, ui, output } = fixture();
    context.input({ target: { id: 'app-estimate-count', value, valueAsNumber: value === '' ? NaN : Number(value) } });
    context.change({ target: { id: 'app-estimate-activity', value: 'b' } });
    assert.match(output.innerHTML, /1~20 사이의 정수/, value);
    assert.doesNotMatch(output.innerHTML, /모두 승인 시/);
    assert.match(context.estimate(), new RegExp('value="' + value.replace('.', '\\.') + '"'));
    context.input({ target: { id: 'app-estimate-count', value: '2', valueAsNumber: 2 } });
    assert.match(output.innerHTML, /2개 모두 최종 승인 시[\s\S]*2000P/);
  }
});

test('unavailable profile history is distinct from confirmed zero approvals', () => {
  const {context}=fixture();
  const helpers = { icon: () => '', loadingPrivate:context.loadingPrivate };
  for (const loading of [true, false]) {
    const html = context.profileScreen({ me: null, user: { name: 'QA' }, loading, online:true }, helpers);
    assert.doesNotMatch(html, /승인<\/span><strong>0회|0분/);
    assert.match(html, loading ? /내역을 불러오고/ : /내역을 불러오지 못/);
  }
  assert.match(context.profileScreen({ me: { videos: [] }, user: {}, loading: false, online:true }, helpers), /승인<\/span><strong>0회/);
  assert.match(context.profileScreen({ me: { videos: [{ status: 'approved', duration: 120 }] }, user: {}, loading: false, online:true }, helpers), /승인<\/span><strong>1회[\s\S]*2분/);
});

test('private history loading, unavailable, offline and confirmed empty states stay distinct', () => {
  const { context } = fixture();
  for (const state of [
    { me: null, loading: true, online: true },
    { me: null, loading: false, online: true, error: '내역 읽기 실패' },
    { me: null, loading: false, online: false },
  ]) {
    const html = context.loadingPrivate(state);
    assert.doesNotMatch(html, /아직 제출한 영상이 없어요|승인 0회/);
    assert.match(html, state.loading ? /불러오고/ : state.online ? /내역 읽기 실패.*다시 불러오기/ : /인터넷 연결을[\s\S]*다시 연결하기/);
  }
  assert.equal(context.loadingPrivate({ me: { videos: [] }, online: true, loading: false }), '');
});
