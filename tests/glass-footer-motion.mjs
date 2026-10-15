import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.claude/skills/gstack/node_modules/playwright/index.mjs')));
const root=fileURLToPath(new URL('../',import.meta.url));
const native=existsSync(path.join(root,'mobile/overlays/ios-ego/app/ego-glass-nav.js'));
const overlay=native?path.join(root,'mobile/overlays/ios-ego'):root;
const kind=native?'native':'public';
const browser=await chromium.launch({headless:true});
const labels=['홈','촬영','보상','프로필'];
const routes=['home','missions','wallet','profile'];
const iconNames=native?['house','camera','coins','user']:['house','camera','wallet','user'];
const nativeIcon=native?(await import(pathToFileURL(path.join(overlay,'app/ego-icons.js')))).icon:null;
const iconMarkup=await Promise.all(iconNames.map(async name=>native?nativeIcon(name):`<span class="app-icon" style="--icon:url('data:image/svg+xml;base64,${(await readFile(path.join(root,'app/icons/phosphor',name+'.svg'))).toString('base64')}')" aria-hidden="true"></span>`));
const markup=()=>labels.map((label,i)=>`<a data-tab="${routes[i]}" href="#${routes[i]}" aria-label="${label}" ${i===0?'aria-current="page"':''}>${iconMarkup[i]}<span>${label}</span></a>`).join('');
try {
 {
  const source=(await readFile(overlay+'/app/ego-footer-icons.js','utf8')).replace(/^export /gm,'')+'\n'+(await readFile(overlay+'/app/ego-glass-nav.js','utf8')).replace(/^import .*;\r?\n/gm,'');
  const css=(await Promise.all([root+'/shared/base.css',overlay+'/app/app.css',overlay+'/app/ego-experience.css',overlay+'/app/ego-reference-theme.css',overlay+'/app/ego-glass-nav.css',...(native?[overlay+'/app/ego-icons.css']:[])].map(file=>readFile(file,'utf8')))).join('\n');
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><main id="app-shell" class="app-shell" data-screen="home"><nav class="app-bottom-nav">${markup()}</nav></main>`);
  await page.evaluate(()=>{window.activations=[];document.querySelector('nav').addEventListener('click',event=>{const link=event.target.closest('a[data-tab]');if(!link||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;event.preventDefault();activations.push(link.dataset.tab);document.querySelectorAll('a[data-tab]').forEach(tab=>tab.removeAttribute('aria-current'));link.setAttribute('aria-current','page');});});
  await page.addScriptTag({content:source});
  await page.waitForSelector('[data-glass-ready]');
  const original=await page.locator('a[data-tab]').evaluateAll(tabs=>tabs.map(tab=>tab.innerHTML));
  assert.deepEqual(await page.locator('a[data-tab]').allTextContents(),labels);
  assert.equal(await page.locator('a[data-tab]').count(),4);
  assert.equal(await page.locator('.ego-glass-lens').getAttribute('aria-hidden'),'true');
  assert.equal(await page.locator('.ego-glass-lens').evaluate(lens=>lens.inert),true);
  assert.equal(await page.locator('.ego-glass-optics').evaluate(node=>node.namespaceURI),'http://www.w3.org/2000/svg','filter source uses the SVG rendering pipeline');
  assert.equal(await page.locator('.ego-glass-optics foreignObject').count(),0,'optical glyphs never depend on foreignObject filtering');
  assert.deepEqual(await page.locator('[data-glass-label]').allTextContents(),labels,'pure SVG optical labels preserve original text');
  assert.equal(await page.locator('.ego-glass-lens a,.ego-glass-lens [data-tab]').count(),0);
  assert.deepEqual(await page.locator('.ego-glass-copy-track > .ego-glass-copy-tab').allTextContents(),labels);
  assert.deepEqual(await page.locator('.ego-glass-copy-track > .ego-glass-copy-tab').evaluateAll(copies=>copies.map(copy=>copy.dataset.footerTab)),routes);
  assert.equal(await page.locator('.ego-glass-copy-track [data-footer-fill]').count(),4,'all real routes receive cloned filled artwork');
  assert.equal(await page.locator('nav>a [data-footer-artwork]').count(),0,'original accessible icon DOM stays untouched');
  const restFill=await page.locator('.ego-glass-base-track [data-footer-fill]').evaluateAll(groups=>groups.map(group=>getComputedStyle(group).opacity));
  assert.deepEqual(restFill,['1','0','0','0'],'resting active route is solid; other base icons keep outlines');
  const boxes=await page.locator('a[data-tab]').evaluateAll(tabs=>tabs.map(tab=>{const r=tab.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width}}));
  await page.evaluate(()=>{window.opticalSamples=[];const sample=()=>{const nav=document.querySelector('nav'),lens=document.querySelector('.ego-glass-lens'),track=document.querySelector('.ego-glass-copy-track');const p=Number(nav.style.getPropertyValue('--glass-progress'));opticalSamples.push({p,height:lens.getBoundingClientRect().height,scale:new DOMMatrix(getComputedStyle(track).transform).a,displacement:[...document.querySelectorAll('feDisplacementMap')].map(node=>Number(node.getAttribute('scale')))});if(opticalSamples.length<30)requestAnimationFrame(sample)};requestAnimationFrame(sample)});
  await page.mouse.move(boxes[0].x,boxes[0].y);await page.mouse.down();
  await page.waitForSelector('[data-glass-pressed]');
  await page.waitForFunction(()=>Number(document.querySelector('nav').style.getPropertyValue('--glass-progress'))===1);
  const samples=await page.evaluate(()=>opticalSamples.filter(sample=>sample.p>.01&&sample.p<.99));
  assert.ok(samples.length>1,'press has intermediate optical states instead of jumping');
  const heldScales=await page.evaluate(()=>[...document.querySelectorAll('feDisplacementMap')].map(node=>Number(node.getAttribute('scale'))));
  for(const sample of samples){assert.ok(Math.abs(sample.height-(56+20*sample.p))<.1);assert.ok(Math.abs(sample.scale-(1+.2*sample.p))<.001);sample.displacement.forEach((value,index)=>assert.ok(Math.abs(value-heldScales[index]*sample.p)<.001,'all optical rays share continuous press progress'))}
  const magnified=await page.evaluate(()=>{const lens=document.querySelector('.ego-glass-lens'),copy=lens.querySelector('[data-footer-outline]'),original=document.querySelector('.ego-glass-base-track [data-footer-outline]');return{lens:lens.getBoundingClientRect().width,nav:document.querySelector('nav').getBoundingClientRect().height,height:lens.getBoundingClientRect().height,copy:copy.getBoundingClientRect().width,original:original.getBoundingClientRect().width,visible:getComputedStyle(lens.querySelector('.ego-glass-copy-track')).opacity}});
  assert.ok(magnified.lens>boxes[0].width*1.2,JSON.stringify({magnified,box:boxes[0]}));assert.ok(magnified.height>magnified.nav);assert.ok(magnified.copy>=magnified.original*1.19,JSON.stringify(magnified));assert.equal(magnified.visible,'1');
  const field=await page.evaluate(async()=>{
    async function pixels(selector){const regionHeight=Number(document.querySelector('filter').getAttribute('height')),lensHeight=document.querySelector('.ego-glass-lens').getBoundingClientRect().height;const image=new Image();image.src=document.querySelector(selector).getAttribute('href');await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);const pixel=(x,y)=>[...context.getImageData(Math.min(image.width-1,Math.floor(x)),Math.min(image.height-1,Math.floor(y)),1,1).data];return{width:image.width,height:image.height,center:pixel(image.width/2,image.height/2),top:pixel(image.width/2,image.height*(.5-.45*lensHeight/regionHeight)),profile:Array.from({length:25},(_,i)=>pixel(image.width/2,image.height*(.5-.5*lensHeight/regionHeight*i/24))[1])}}
    const filter=document.querySelector('filter'),lens=document.querySelector('.ego-glass-lens').getBoundingClientRect();
    return{field:await pixels('[data-field]'),rim:await pixels('[data-rim]'),scales:[...document.querySelectorAll('feDisplacementMap')].map(node=>Number(node.getAttribute('scale'))),clip:getComputedStyle(document.querySelector('.ego-glass-base-track')).clipPath,originalOpacity:getComputedStyle(document.querySelector('nav>a .app-icon')).opacity,overflow:getComputedStyle(document.querySelector('.ego-glass-optics')).overflow,guardX:Number(filter.getAttribute('x')),guardY:Number(filter.getAttribute('y')),filterWidth:Number(filter.getAttribute('width')),lensWidth:lens.width};
  });
  assert.ok(field.field.width>128&&field.field.height>80,'higher resolution optical field');
  assert.ok(Math.abs(field.field.center[0]-128)<=2&&Math.abs(field.field.center[1]-128)<=2,'optical center remains calm');
  const turns=field.field.profile.slice(1).map((value,i)=>value-field.field.profile[i]);
  assert.ok(turns.some(delta=>delta>3)&&turns.some(delta=>delta< -3),'curved radial field has a real peak and return, not a monotonic edge ramp');
  assert.equal(field.rim.center[3],0,'chromatic separation excludes center');assert.ok(field.rim.top[3]>0);
  assert.equal(field.scales.length,3);assert.equal(new Set(field.scales).size,3,'core and chromatic rays use distinct displacement');assert.ok(field.scales.every(scale=>scale>0));
  assert.equal(field.overflow,'visible','neighboring source pixels survive until lens clipping');
  assert.ok(field.guardX<=-24&&field.guardY<=-24&&field.filterWidth>=field.lensWidth+48,'filter keeps a source sampling guard beyond the lens');
  assert.match(field.clip,/evenodd/,'base excludes lens content');assert.equal(field.originalOpacity,'0','original paint cannot ghost underneath optical copy');
  // The lens follows the held pointer continuously, including between destinations.
  const intermediateX=(boxes[1].x+boxes[2].x)/2;
  await page.mouse.move(intermediateX,boxes[1].y,{steps:5});
  await page.waitForFunction(expected=>{const r=document.querySelector('.ego-glass-lens').getBoundingClientRect();return Math.abs(r.x+r.width/2-expected)<1.5},intermediateX);
  assert.deepEqual(await page.evaluate(()=>activations),[],'intermediate held travel never routes');
  assert.equal(await page.locator('[data-glass-pressed]').count(),1,'intermediate travel keeps the lens raised');
  await page.waitForFunction(()=>{const width=document.querySelector('.ego-glass-lens').getBoundingClientRect().width;const now=performance.now();if(window.lastRimWidth!==width){window.lastRimWidth=width;window.rimStableSince=now}return now-window.rimStableSince>120});
  assert.deepEqual(await page.locator('.ego-glass-copy-track [data-footer-fill]').evaluateAll(groups=>groups.map(group=>getComputedStyle(group).opacity)),['1','1','1','1'],'held optical copy fills all routes');
  const fragments=await page.evaluate(()=>{
    const lens=document.querySelector('.ego-glass-lens').getBoundingClientRect();
    const copies=[...document.querySelectorAll('.ego-glass-copy-track>.ego-glass-copy-tab')];
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');const colorPixel=copy=>{context.clearRect(0,0,1,1);context.fillStyle=getComputedStyle(copy).color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3)};
    return{colors:copies.map(colorPixel),visible:[copies[1],copies[2]].map(copy=>{const r=copy.querySelector('.app-icon').getBoundingClientRect();return Math.max(0,Math.min(lens.right,r.right)-Math.max(lens.left,r.left))})};
  });
  assert.ok(fragments.visible.every(width=>width>4),'held midpoint shows two neighboring glyph fragments');
  assert.ok(fragments.colors.every(color=>color[0]===0&&color[1]===36&&color[2]===255),'whole lens copy uses blue ink independent of the nearest tab');
  const filtered=await page.locator('.ego-glass-lens').screenshot();
  await page.locator('.ego-glass-optics').evaluate(node=>node.style.filter='none');
  const unfiltered=await page.locator('.ego-glass-lens').screenshot();
  const rimDifference=await page.evaluate(async({filtered,unfiltered})=>{
    async function decode(base64){const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return{width:image.width,height:image.height,data:context.getImageData(0,0,image.width,image.height).data}}
    const a=await decode(filtered),b=await decode(unfiltered);if(a.width!==b.width||a.height!==b.height)return{sameSize:false};
    const radius=a.height/2,straight=Math.max(0,(a.width-a.height)/2);let rimPixels=0,changed=0,deltaTotal=0;
    for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
      const dx=Math.max(0,Math.abs(x+.5-a.width/2)-straight),dy=y+.5-radius,distance=Math.hypot(dx,dy)/radius;
      if(distance<.68||distance>.98)continue;rimPixels++;const i=(y*a.width+x)*4,delta=Math.max(...[0,1,2].map(channel=>Math.abs(a.data[i+channel]-b.data[i+channel])));
      if(delta>16){changed++;deltaTotal+=delta;}
    }
    return{sameSize:true,rimPixels,changed,changedRatio:changed/rimPixels,meanChangedDelta:deltaTotal/Math.max(1,changed)};
  },{filtered:filtered.toString('base64'),unfiltered:unfiltered.toString('base64')});
  assert.equal(rimDifference.sameSize,true);
  assert.ok(rimDifference.changedRatio>.01&&rimDifference.changed>20,'curved rim must show a meaningful optical pixel difference: '+JSON.stringify(rimDifference));
  console.log(`${kind} held midpoint rim optical difference: ${JSON.stringify(rimDifference)}`);
  await page.locator('.ego-glass-optics').evaluate(node=>node.style.removeProperty('filter'));
  await page.mouse.move(boxes[3].x,boxes[3].y,{steps:5});
  await page.waitForFunction(expected=>{const r=document.querySelector('.ego-glass-lens').getBoundingClientRect();return Math.abs(r.x+r.width/2-expected)<1.5},boxes[3].x);
  assert.deepEqual(await page.evaluate(()=>activations),[],'final held position still does not route');
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>activations),['profile'],'drag release routes exactly once');
  const release=await page.evaluate(()=>({progress:Number(document.querySelector('nav').style.getPropertyValue('--glass-progress')),optics:getComputedStyle(document.querySelector('.ego-glass-optics')).opacity}));
  assert.ok(release.progress>0,'release retains optical progress until the spring settles');
  assert.equal(release.optics,'1','release retains optical content during settling');
  await page.waitForFunction(()=>Number(document.querySelector('nav').style.getPropertyValue('--glass-progress'))===0);
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('feDisplacementMap')].map(node=>Number(node.getAttribute('scale')))),[0,0,0],'all optical rays settle to zero');
  await page.mouse.move(boxes[0].x,boxes[0].y);await page.mouse.down();await page.mouse.move(boxes[0].x,boxes[0].y-100);await page.mouse.up();assert.equal(await page.evaluate(()=>activations.length),1,'outside release cancels');
  await page.mouse.move(boxes[0].x,boxes[0].y);await page.mouse.down();await page.evaluate(()=>document.querySelector('nav').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));await page.mouse.up();assert.equal(await page.evaluate(()=>activations.length),1,'pointercancel cancels');
  await page.locator('a[data-tab="missions"]').focus();await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>activations),['profile','missions'],'keyboard uses original link once');
  await page.evaluate(()=>{const tab=document.querySelector('nav>a');tab.dispatchEvent(new PointerEvent('pointerdown',{pointerId:9,isPrimary:true,button:0,ctrlKey:true,bubbles:true}));});assert.equal(await page.locator('[data-glass-pressed]').count(),0,'modified pointer ignored');
  await page.evaluate(html=>{document.querySelector('nav').innerHTML=html},markup());await page.waitForFunction(()=>document.querySelectorAll('.ego-glass-copy-track > .ego-glass-copy-tab').length===4);assert.equal(await page.locator('a[data-tab]').count(),4,'rerender never creates extra tabs');
  await page.setViewportSize({width:932,height:430});await page.waitForTimeout(80);
  const sizes=await page.evaluate(()=>({nav:document.querySelector('nav').getBoundingClientRect().width,clone:document.querySelector('.ego-glass-copy-tab').getBoundingClientRect().width,tab:document.querySelector('nav>a').getBoundingClientRect().width,shell:document.querySelector('#app-shell').getBoundingClientRect().width}));assert.equal(sizes.shell,932);assert.ok(sizes.nav>800);assert.ok(Math.abs(sizes.clone-sizes.tab)<.1,'resize updates actual clone geometry');
  await page.emulateMedia({reducedMotion:'reduce'});const box=await page.locator('a[data-tab="wallet"]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(30);assert.equal(await page.locator('.ego-glass-optics').evaluate(node=>getComputedStyle(node).opacity),'0');assert.equal(await page.locator('.ego-glass-lens').evaluate(node=>node.getAnimations().length),0);await page.mouse.up();
  assert.deepEqual(await page.locator('a[data-tab]').allTextContents(),labels,'labels stay unchanged');
  assert.deepEqual(await page.locator('a[data-tab]').evaluateAll(tabs=>tabs.map(tab=>tab.innerHTML)),original,'original accessible icon and label markup is unchanged');
  assert.deepEqual(pageErrors,[],'no module import or runtime errors');
  await page.close();console.log(`PASS ${kind} glass footer optics/continuous release: clones, magnification, exactly-once drag, cancel/outside, keyboard, modifiers, rerender, resize, reduced motion`);
 }
} finally {await browser.close();}
