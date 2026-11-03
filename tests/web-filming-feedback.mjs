import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { activities, activityIdeas, exampleFor } from '../app/catalog.js';

const source = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
const task = { ...activities[0], reward: 1234, instructions: '운영자가 정한 현재 조건 <script>unsafe</script>' };
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const context = vm.createContext({
  tasks: () => [task, { ...task, id: 'no-example', exampleId: null }],
  exampleFor, activityIdeas, esc: escape, points: value => `${value.toLocaleString('ko-KR')}P`,
  reward: item => item.reward, icon: () => '', taskMedia: () => '<img alt="촬영 예시">',
  summaryStats: items => items.map(item => item.join(' ')).join('\n'),
  unavailableActivity: () => '<unavailable/>',
  titles: { guide: '촬영 가이드', education: '촬영 교육' }, location: { hash: '' }, URLSearchParams,
});
vm.runInContext(source.slice(source.indexOf('function route(){'), source.indexOf('function tasks(){'))
  + source.match(/function button\([^\n]+/)[0] + '\n'
  + source.match(/function backHref\([^\n]+/)[0] + '\n'
  + source.slice(source.indexOf('function activity(current,state)'), source.indexOf('function gate(state,current)'))
  + source.match(/function filmingIdeas\([^\n]+/)[0], context);
const render = expression => vm.runInContext(expression, context);
const intro = render('activity({id:"dishwashing"},{})');
assert.match(intro, /1,234P/);
assert.match(intro, /최종 승인 후/);
assert.match(intro, /운영자가 정한 현재 조건 &lt;script&gt;/);
assert.doesNotMatch(intro, /<script>unsafe/);
for (const text of ['촬영 조건', '촬영 전 확인', '0.5배', '10초', '1분~1분 30초', '최종 승인된 영상']) assert.ok(intro.includes(text), text);
assert.doesNotMatch(intro, /data-app-action="(?:record|import)"/);
for (const step of [1, 2, 3, 4]) {
  context.location.hash = `#guide/dishwashing/${step}`;
  assert.equal(render('route().step'), step);
  const html = render(`guide({id:"dishwashing",step:${step}})`);
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.match(html, new RegExp(`4단계 중 ${step}단계`));
  assert.equal(render(`backHref({name:"guide",id:"dishwashing",step:${step}})`), step === 1 ? '#activity/dishwashing' : `#guide/dishwashing/${step - 1}`);
  if (step < 4) {
    assert.match(html, new RegExp(`#guide/dishwashing/${step + 1}`));
    assert.doesNotMatch(html, /data-app-action="(?:record|import)"/);
  } else {
    assert.match(html, /#education\/dishwashing\/4/);
    assert.match(html, /data-app-action="import" data-id="dishwashing"/);
    assert.match(html, /data-app-action="record" data-id="dishwashing"/);
    assert.match(html, /이용 동의를 확인한 뒤 직접 진행/);
  }
}
for (const step of [3, 4]) assert.equal(render(`backHref({name:"education",id:"dishwashing",step:${step}})`), `#guide/dishwashing/${step}`);
assert.doesNotMatch(render('guide({id:"no-example",step:1})'), /data-app-action="sample"/);
assert.equal(render('guide({id:"unpublished",step:4})'), '<unavailable/>');
assert.equal(activityIdeas.length, 8);
assert.equal(activityIdeas.reduce((count, group) => count + group.activities.length, 0), 25);
assert.equal(activities.length, 8, 'reference ideas must not create published tasks');
assert.ok(activities.every(item => item.reward === undefined && item.actions.length >= 3 && item.actions.length <= 5));
assert.match(render('filmingIdeas()'), /실제 제출은 현재 촬영 활동 목록에 공개된 항목과 조건/);

const prep = await import('../app/preparation.js');
prep.setPublishedActivities([task]);
assert.equal(prep.selectPreparationActivity(task.id), true);
for (const returnStep of [3, 4]) {
  const markup = prep.renderEducation({ icon: () => '', esc: escape, returnActivity: task.id, returnStep });
  assert.ok(markup.includes(`#guide/dishwashing/${returnStep}`));
}
const invalidReturn = prep.renderEducation({ icon: () => '', esc: escape, returnActivity: 'other', returnStep: 4 });
assert.ok(invalidReturn.includes('#guide/dishwashing/1'));
console.log('PASS: four guide steps, final-only capture/import, escaped authoritative instructions/rewards, return routes, unpublished tasks, and 8 informational environments.');
