import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const browser=await chromium.launch({headless:true});
const roots=[fileURLToPath(new URL('../',import.meta.url))];
const output=process.env.CAMERA_LAYOUT_OUTPUT;
if(output)await mkdir(output,{recursive:true});
try {
for (const [index,root] of roots.entries()) {
 const source=await readFile(`${root}/studio/camera.js`,'utf8');
 const template=source.match(/dialog.innerHTML = `([\s\S]*?)`;\n  return dialog/)[1];
 const markup=new Function('title','canRecord','GUIDE_LINES','esc','icon','submission','return `'+template+'`;')('식탁 정리',true,['1분 자동 종료','가로로 고정','손과 작업 대상','얼굴·개인정보 제외'],String,()=> '●',true);
 const css=await readFile(`${root}/studio/camera.css`,'utf8');
 for(const [width,height] of [[844,390],[667,375],[568,320],[1024,768]]) for(const safe of [false,true]) {
  const page=await browser.newPage({viewport:{width,height}});
  const style=safe?css.replaceAll('env(safe-area-inset-left)','44px').replaceAll('env(safe-area-inset-right)','44px').replaceAll('env(safe-area-inset-bottom)','21px'):css;
  await page.setContent(`<style>${style}</style><dialog class="studio-camera-dialog" data-zoom="visible">${markup}</dialog>`);
  await page.evaluate(()=>{
   document.querySelector('dialog').showModal();
   document.querySelector('[data-camera-zoom]').hidden=false;
   document.querySelector('[data-status]').textContent='준비됐습니다. 가운데 버튼을 누르면 녹화가 시작돼요.';
   document.querySelector('[data-zoom-status]').textContent='현재 1× · 지원 배율 0.5× / 1× / 2×';
   document.querySelector('[data-flip]').hidden=false;
   document.querySelectorAll('button[data-zoom]').forEach(b=>b.disabled=false);
  });
  for(const recording of [false,true]) {
   await page.evaluate(recording=>{document.querySelector('[data-timer]').hidden=!recording;document.querySelector('[data-record]').hidden=recording;document.querySelector('[data-stop]').hidden=!recording;},recording);
   const r=await page.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    return {preview:rect('.studio-camera-live'),heading:rect('.studio-camera-heading'),zoom:rect('.studio-camera-zoom'),zoomStatus:rect('[data-zoom-status]'),timer:rect('[data-timer]'),shutter:rect(document.querySelector('[data-record]').hidden?'[data-stop]':'[data-record]'),rail:getComputedStyle(document.querySelector('.studio-camera-bottom')).backgroundColor,buttons:[...document.querySelectorAll('button[data-zoom]')].map(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b};})};
   });
   assert.equal(r.preview.width,width);assert.equal(r.preview.height,height);assert.equal(r.rail,'rgba(0, 0, 0, 0)');
   assert.ok(r.zoom.y>=r.heading.bottom);assert.ok(Math.abs(r.heading.x+r.heading.width/2-width/2)<1);
   assert.ok(r.shutter.right<=width-(safe?44:16));assert.ok(r.shutter.y>=r.zoom.bottom || r.shutter.x>=r.zoomStatus.right);assert.ok(r.shutter.bottom<height-(safe?21:0));
   assert.ok(r.buttons.every(b=>b.width>=44&&b.height>=44&&b.hit));
   if(recording)assert.ok(r.timer.y>=r.zoom.bottom);
   if(output&&!recording&&width===844&&!safe)await page.screenshot({path:path.join(output,`camera-landscape-${index}.png`)});
  }
  await page.close();
 }
 console.log(`${root}: 16 ready/recording viewport + safe-area layout cases passed`);
}
}finally{await browser.close();}
