import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
let app=new URL('mobile/overlays/ios-ego/app/',root),native=true;
try{await access(new URL('app.js',app));}catch{app=new URL('app/',root);native=false;}
const source=await readFile(new URL('app.js',app),'utf8');
const montageIcon=native?(await import(new URL('ego-icons.js',app))).icon:null;
const context=vm.createContext({appVersion:()=>'테스트',montageIcon,esc:String,getInstallState:()=>({}),isNativeApp:()=>native,loadingPrivate:()=>null,points:String,money:String,stamp:String,empty:()=>''});
const iconSource=source.match(/^const icon=.*$/m)?.[0]||'const icon=montageIcon;';
vm.runInContext([iconSource,...['row','settings'].map(name=>source.match(new RegExp(`^function ${name}\\(.*$`,'m'))[0])].join('\n'),context);
const state={access:'allowed',online:true,user:{email:'member@example.test',role:'admin'},me:{wallet:{available:0,earned:0},videos:[],ledger:[],payouts:[]}};
for(const name of ['settings']){
 const html=context[name](state);
 assert.doesNotMatch(html,/ego-icon-missing|data-icon-missing/,`${name} must not show crossed-box fallback`);
 assert.match(html,/icons\/phosphor\/wallet\.svg/,`${name} uses existing wallet glyph`);
 if(name==='settings')assert.match(html,/icons\/phosphor\/shield-check\.svg/);
 for(const [,asset] of html.matchAll(/--icon:url\('\.\/([^']+)'\)/g))await access(new URL(`app/${asset}`,root));
}
for(const glyph of ['wallet','shield-check'])assert.match(await readFile(new URL(`app/icons/phosphor/${glyph}.svg`,root),'utf8'),/<svg/);
assert.match(await readFile(new URL('app/icons/phosphor/LICENSE.txt',root),'utf8'),/MIT License/);
console.log(`${native?'Native':'Public'} settings render with existing licensed wallet/privacy glyphs and no missing icons; referenced mask assets exist.`);
