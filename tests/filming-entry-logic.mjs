import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
let app=new URL('../mobile/overlays/ios-ego/app/',import.meta.url);
try { await access(new URL('app.js',app)); } catch { app=new URL('../app/',import.meta.url); }
const popup=(await readFile(new URL('welcome-popup.js',app),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
// Unit fixture only: executes real handlers, not native dialog/layout behavior.
const document={activeElement:null,body:{append(){}},createElement(){
 const children=new Map();
 return {dataset:{},setAttribute(){},set innerHTML(value){this.html=value;},querySelector(selector){if(!children.has(selector))children.set(selector,{focus(){}});return children.get(selector);},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}};
}};
const context=vm.createContext({document,crypto:{randomUUID:()=> 'test-popup'},location:{origin:'http://localhost'},URL});
vm.runInContext(popup,context);
for(const [path,expected] of [['#missions','#missions'],['#education','#education'],['#activity/folding-clothes','#activity/folding-clothes'],['#guide/folding-clothes/3','#guide/folding-clothes/3'],[undefined,'#missions'],['','#missions'],['https://evil.test','#missions'],['javascript:alert(1)','#missions'],['#guide/folding-clothes/4','#missions']]){
 const routes=[];
 const dialog=context.popupDialog({ctaPath:path},{onAction:route=>routes.push(route)});
 assert.equal(dialog.open,true);
 dialog.querySelector('.ego-welcome-primary').onclick();
 assert.equal(dialog.open,false);
 assert.deepEqual(routes,[expected]);
}
for(const preview of [false,true]){
 const routes=[];
 const dialog=context.popupDialog({ctaPath:'#missions'},{preview,onAction:route=>routes.push(route)});
 dialog.querySelector(preview?'.ego-welcome-primary':'.ego-welcome-close').onclick();
 assert.equal(dialog.open,false);
 assert.deepEqual(routes,[],preview?'admin preview never navigates':'dismissal never navigates');
}
const source=await readFile(new URL('app.js',app),'utf8');
const experience=await readFile(new URL('experience-ui.js',app),'utf8');
const home=experience.slice(experience.indexOf('export function homeScreen'),experience.indexOf('\nexport const mascotArt')).replace('export ','');
vm.runInContext(`const icon=()=>'',esc=String,getInstallState=()=>({}),isNativeApp=()=>false,appVersion=()=>'테스트';\n${home}\n${source.match(/^function row\(.*$/m)[0]}\n${source.match(/^function settings\(state\).*$/m)[0]}`,context);
const markup=context.homeScreen({},{tasks:()=>[],activityCard:()=>'',categoryRail:()=>'',icon:()=>'',ui:{category:'전체'}});
assert.match(markup,/<a class="ego-guide-banner" href="#first-filming">/);
assert.match(markup,/처음이라면, 여기부터/);
const settings=context.settings({access:'allowed',user:{email:'member@example.test'}});
assert.match(settings,/<a class="settings-row" href="#missions">[^]*?<strong>촬영 가이드<\/strong><small>활동을 골라 준비해요\.<\/small>/);
assert.match(settings,/<a class="settings-row" href="#education\?from=settings">[^]*?<strong>촬영 교육·점검<\/strong>/);
assert.doesNotMatch(settings,/#guide\/dishwashing\/1/);
console.log('Filming entry unit logic passed: real popup route/action handlers and rendered home/settings destinations. DOM fixture only; browser interaction remains separately tested.');
