import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const catalogURL=new URL('app/catalog.js',root).href;
let appRoot=new URL('mobile/overlays/ios-ego/app/',root);
try { await access(new URL('app.js',appRoot)); } catch { appRoot=new URL('app/',root); }
const iconsURL=new URL('ego-icons.js',appRoot).href;
const source=(await readFile(new URL('preparation.js',appRoot),'utf8')).replace("'./catalog.js'",JSON.stringify(catalogURL)).replace("'./ego-icons.js'",JSON.stringify(iconsURL));
const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
const prep=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const {activities}=await import(catalogURL);
prep.setPublishedActivities([...activities,{id:'new-task',title:'새 활동',category:'주방',description:'새 활동 설명',exampleId:'unknown-example'}]);
assert.equal(prep.selectPreparationActivity('dishwashing'),true);
assert.equal(prep.getPreparationState().training.example,'dishwashing');
let markup=prep.renderEducation();
assert.match(markup,/data-example="dishwashing"/);
assert.match(markup,/예시 영상 재생/);

assert.doesNotMatch(markup,/data-prep-example="folding-clothes"/,'selected activity must not show unrelated examples');
const before=prep.getPreparationState();
prep.toggleSavedActivity('folding-clothes');
assert.equal(prep.getPreparationState().plan.selected,before.plan.selected,'save is independent from activity selection');
assert.equal(prep.getPreparationState().training.example,before.training.example);
assert.deepEqual(prep.getPreparationState().plan.saved,['folding-clothes']);
prep.toggleSavedActivity('folding-clothes');
assert.deepEqual(prep.getPreparationState().plan.saved,[]);
for(const id of ['dining','new-task']){
 assert.equal(prep.selectPreparationActivity(id),true);
 assert.equal(prep.getPreparationState().training.example,'','missing and unknown example mappings clear prior selection');
 markup=prep.renderEducation();
 assert.match(markup,/예시 영상이 아직 준비되지 않았어요/);
 assert.doesNotMatch(markup,/data-prep-action="example"|data-app-action="sample"/,'missing mapping must not expose any sample playback');
}
assert.equal(prep.selectPreparationActivity('hostile/unknown'),false);
assert.equal(prep.getPreparationState().plan.selected,'new-task');
prep.selectPreparationActivity('dishwashing');
prep.setPublishedActivities(activities.map(activity=>({...activity,exampleId:undefined})));
assert.doesNotMatch(prep.renderEducation(),/data-prep-action="example"|data-app-action="sample"/,'catalog mapping removal must not leave a stale example');
assert.equal(prep.getPreparationState().training.example,'','catalog updates clear a removed mapping in storage');
const app=await readFile(new URL('app.js',appRoot),'utf8');
const backSource=app.match(/function backHref\(current\)\{[^\n]+/)[0];
const back=Function('tasks',`${backSource};return backHref;`)(()=>[{id:'dining'},{id:'task with space'}]);
assert.equal(back({name:'education',id:'dining'}),'#activity/dining');
assert.equal(back({name:'education',id:'task%20with%20space'}),'#activity/task%20with%20space');
for(const id of [undefined,'unknown','%ZZ','https%3A%2F%2Fevil.test'])assert.equal(back({name:'education',id}),'#missions');
assert.match(app,/location.hash=`education\/\$\{encodeURIComponent\(target.dataset.id\)\}/);

console.log('Education: selected-only samples, missing/unknown/stale mappings, independent saves and validated activity-detail/generic-list return paths passed.');

assert.doesNotMatch(app,/exampleFor\(task\)\|\|examples\[0\]/,'guide must not fall back to an unrelated video');

// Reuse the real guide renderer and click branch: guide A must replace the
// persisted selection B, and education's Back must return to A's detail.
prep.setPublishedActivities(activities);
prep.selectPreparationActivity('folding-clothes');
prep.toggleSavedActivity('folding-clothes');
const guideSource=app.match(/function guide\(current\)\{[^\n]+/)[0];
const buttonSource=app.match(/function button\(label,action,extra='',kind='primary'\)\{[^\n]+/)[0];
const stepsSource=app.slice(app.indexOf('const guideSteps=['),app.indexOf('function guide(current)'));
const {exampleFor}=await import(catalogURL);
const renderGuide=Function('tasks','exampleFor','icon','esc',`${stepsSource}\n${buttonSource}\n${guideSource}\nreturn guide;`)(()=>activities,exampleFor,()=>'',String);
const guideMarkup=renderGuide({id:'dishwashing',step:3});
const educationButton=guideMarkup.match(/<a[^>]*data-app-action="prepare-activity"[^>]*data-id="([^"]+)"/);
assert.ok(educationButton,'guide education entry must select the guide activity through the shared prepare action');
const branch=app.split('\n').find(line=>line.includes("if(action==='prepare-activity')"));
const testLocation={hash:''};
Function('action','target','selectPreparationActivity','location','toast','preparationActivityError',branch)('prepare-activity',{dataset:{id:educationButton[1],returnStep:'3'}},prep.selectPreparationActivity,testLocation,assert.fail,prep.preparationActivityError);
assert.equal(prep.getPreparationState().plan.selected,'dishwashing');
assert.equal(prep.getPreparationState().training.example,'dishwashing');
assert.deepEqual(prep.getPreparationState().plan.saved,['folding-clothes'],'guide entry preserves independent saved activities');
assert.equal(testLocation.hash,'education/dishwashing/3');
assert.match(guideMarkup,/href="#education\/dishwashing\/3"/);
assert.match(guideMarkup,/data-return-step="3"/);
assert.match(app,/renderEducation\(\{icon,esc,returnActivity:current.id,returnStep:current.step,activityPickerOpen\}\)/);
const guideBack=Function('tasks',`${backSource};return backHref;`)(()=>activities);
assert.equal(guideBack({name:'education',id:testLocation.hash.split('/')[1],step:3}),'#guide/dishwashing/3');
assert.match(prep.renderEducation({returnActivity:'dishwashing',returnStep:3}),/href="#guide\/dishwashing\/3"/);
assert.match(prep.renderEducation(),/href="#guide\/dishwashing\/1"/);
prep.selectPreparationActivity('folding-clothes');
assert.match(prep.renderEducation({returnActivity:'dishwashing',returnStep:3}),/href="#guide\/folding-clothes\/1"/,'changing activity starts its own guide');
Function('action','target','selectPreparationActivity','location','toast','preparationActivityError',branch)('prepare-activity',{dataset:{id:'dishwashing'}},prep.selectPreparationActivity,testLocation,assert.fail,prep.preparationActivityError);
assert.equal(testLocation.hash,'education/dishwashing','generic education entry does not inherit return step');
console.log('Guide A → education with persisted selection B: switches to A, preserves saves, explicit example A and return to guide step 3, generic entry step 1 and changed activity step 1 passed.');

// Direct URL entry must normalize the step and reject inherited object keys.
const routeSource=app.slice(app.indexOf('function route(){'),app.indexOf('\nfunction tasks()'));
const titlesSource=app.match(/^const titles=.*$/m)[0];
const routeLocation={hash:''};
const parseRoute=Function('location',`${titlesSource}\n${routeSource}\nreturn route;`)(routeLocation);
for(const suffix of ['1.5','2.5','NaN','Infinity','-1','4']){
 routeLocation.hash=`#guide/dishwashing/${suffix}`;
 const current=parseRoute();
 assert.ok(Number.isInteger(current.step)&&current.step>=1&&current.step<=3,'guide step must be a valid integer');
 assert.doesNotThrow(()=>renderGuide(current));
}
for(const key of ['__proto__','hasOwnProperty','constructor','toString']){
 routeLocation.hash=`#${key}`;
 assert.equal(parseRoute().name,'home','only own route names may enter dispatch');
}
// Execute the route-specific education renderer, including entry initialization.
const educationSource=app.match(/^function education\(current[,)].*$/m)?.[0];
assert.ok(educationSource,'education entry needs validated route selection');
let selections=0;
const entry=Function('tasks','getPreparationState','selectPreparationActivity','renderEducation','unavailableActivity','icon','esc',`let educationRoute='';${educationSource};return {render:education,reset:()=>{educationRoute='';}};`)(()=>activities,prep.getPreparationState,id=>{selections++;return prep.selectPreparationActivity(id);},prep.renderEducation,()=>'<unavailable/>',()=>'',String);
prep.selectPreparationActivity('folding-clothes');
let direct=entry.render({name:'education',id:'dishwashing',step:3});
assert.equal(prep.getPreparationState().plan.selected,'dishwashing');
assert.match(direct,/#guide\/dishwashing\/3/);
assert.equal(selections,1);
prep.handlePreparationChange({matches:()=>true,dataset:{prepCheck:'landscape'},checked:true});
entry.render({name:'education',id:'dishwashing',step:3});
assert.equal(prep.getPreparationState().training.preflight.landscape,true,'repeat render preserves completed preparation checks');
assert.equal(selections,1,'rerenders must not reset preparation checks');
prep.selectPreparationActivity('folding-clothes');
assert.match(entry.render({name:'education',id:'dishwashing',step:3}),/#guide\/folding-clothes\/1/,'explicit activity choice on education remains usable');
entry.reset();
entry.render({name:'education',id:'dishwashing',step:3});
assert.equal(prep.getPreparationState().plan.selected,'dishwashing','reentry reapplies URL activity');
for(const id of ['unknown','%ZZ','https%3A%2F%2Fevil.test'])assert.equal(entry.render({name:'education',id,step:3}),'<unavailable/>');
assert.equal(prep.getPreparationState().plan.selected,'dishwashing','invalid URLs do not mutate selection');
assert.match(entry.render({name:'education',step:1}),/#guide\/dishwashing\/1/,'generic education uses saved choice');
console.log('Direct routes: fractional steps, inherited names, URL activity initialization, repeat render and invalid IDs passed.');
