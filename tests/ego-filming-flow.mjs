import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const native=new URL('../mobile/overlays/ios-ego/app/app.js',import.meta.url);
const file=existsSync(native)?native:new URL('../app/app.js',import.meta.url);
const source=readFileSync(file,'utf8');
const task={id:'dishwashing',title:'설거지',category:'주방',description:'식기를 씻어요.',instructions:'공개된 활동 안내',reward:1000,actions:['씻기','헹구기'],tips:['안전하게 촬영해요.'],exampleId:'dishwashing'};
const context=vm.createContext({tasks:()=>[task,{...task,id:'no-example',exampleId:null}],exampleFor:task=>task.exampleId?{id:task.exampleId,poster:'owned-example.jpg',label:task.title}:null,esc:String,points:n=>`${n.toLocaleString('ko-KR')}P`,reward:task=>task.reward,icon:name=>`<i data-icon="${name}"></i>`,taskMedia:()=>'<img src="owned-example.jpg">',unavailableActivity:()=>'<unavailable/>'});
vm.runInContext(source.match(/function button\([^\n]+/)[0]+'\n'+source.slice(source.indexOf('function activity(current,state)'),source.indexOf('function gate(state)'))+'\n'+source.match(/function backHref\([^\n]+/)[0],context);
const render=(expression)=>vm.runInContext(expression,context);
const intro=render('activity({id:"dishwashing"},{})');
assert.match(intro,/1,000P/);assert.match(intro,/검수 승인 후 적립/);assert.match(intro,/베타 촬영 길이/);assert.match(intro,/공개된 활동 안내/);
assert.match(intro,/#guide\/dishwashing\/1/);
assert.doesNotMatch(intro,/data-app-action="(?:record|import|save-activity|prepare-activity)"/,'overview only advances to guide');
assert.doesNotMatch(intro,/계속하면.*동의|완료하고 적립|10분|720p/,'navigation must not imply automatic consent or unconfigured policy');
for(const step of [1,2,3]){
 const html=render(`guide({id:"dishwashing",step:${step}})`);
 assert.match(html,new RegExp(`aria-current="step"`));
 assert.match(html,new RegExp(`3단계 중 ${step}단계`));
 if(step<3){assert.match(html,new RegExp(`#guide/dishwashing/${step+1}`));assert.doesNotMatch(html,/data-app-action="record"|data-app-action="import"/);}
 else{assert.match(html,/data-app-action="import" data-id="dishwashing"/);assert.match(html,/data-app-action="record" data-id="dishwashing"/);assert.match(html,/이용 동의를 확인한 뒤 직접 진행/);}
 assert.equal(render(`backHref({name:"guide",id:"dishwashing",step:${step}})`),step===1?'#activity/dishwashing':`#guide/dishwashing/${step-1}`);
}
assert.doesNotMatch(render('guide({id:"no-example",step:1})'),/owned-example|data-app-action="sample"/,'missing example cannot reuse another task sample');
assert.equal(render('guide({id:"unpublished",step:1})'),'<unavailable/>');
assert.equal(render('activity({id:"unpublished"},{})'),'<unavailable/>');
const importBranch=source.split('\n').find(line=>line.includes("if(action==='import')"));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const calls=[];
const runImport=AsyncFunction('action','target','selectedTask','importVideo',importBranch);
await runImport('import',{dataset:{id:task.id}},id=>id===task.id?task:null,async activity=>calls.push(activity));
assert.equal(calls[0],task,'final upload keeps selected activity context');
await runImport('import',{dataset:{}},()=>assert.fail(),async activity=>calls.push(activity));
assert.deepEqual(calls[1],{},'existing generic import caller keeps default');
console.log('Filming flow: overview → 3 guide steps/back, explicit consent copy, missing samples, final capture and activity-aware import passed.');
