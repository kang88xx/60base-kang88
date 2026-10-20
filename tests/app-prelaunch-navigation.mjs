import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Executes production route/render/action code in a minimal DOM fixture.
// Browser focus geometry and real history are verified separately through CUA.
const files = process.argv.length>2?process.argv.slice(2):['../app/app.js'].map(path=>fileURLToPath(new URL(path,import.meta.url)));
if (!files.length) throw Error('Pass one or more app/app.js paths.');
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const between = (start, end) => {
    const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
    assert.ok(a >= 0 && b > a, `production function boundaries exist: ${start}`);
    return source.slice(a, b);
  };
  const routes = between('function route(){', '\nfunction tasks()');
  const back = between('function backHref(', '\nfunction renderHeader(');
  const reviews = between('function filterVideos(', '\nfunction reviewFilters(');
  const click = between("document.addEventListener('click',async event=>{", "\nwindow.addEventListener('hashchange'");
  function fixture(hash = '#reviews') {
    let onClick, focusTarget = '', rendered = '';
    const videos = [{id:'v1',title:'approved fixture',status:'approved',duration:60,reward:1000}];
    const ui = {reviewFilter:'rejected',reviewQuery:''};
    const context = vm.createContext({
      location:{hash}, URLSearchParams, encodeURIComponent, Number, Object,
      titles:Object.fromEntries(['home','missions','activity','guide','education','estimate','announcements','library','reviews','wallet','profile','settings','support'].map(name=>[name,name])),
      tasks:()=>[{id:'dishwashing'}], ui, videos,
      icon:()=>'', esc:String, stamp:()=>'', duration:()=>'', points:String, statusNames:{approved:'승인'},
      button:(label,action)=>`<button data-app-action="${action}">${label}</button>`,
      empty:(title,copy,action='')=>`<section>${title}${copy}${action}</section>`,
      getAppState:()=>({access:'allowed'}), canEnterApp:()=>true, requireFreshAppSession:()=>true,
      guardedActions:new Set(), pendingActions:new Map(), actionMessages:{}, updateProgress(){},
      toast(message){throw Error(message);},
      document:{addEventListener(type,fn){if(type==='click')onClick=fn;},querySelector(selector){return {focus(){focusTarget=selector;}};}},
      main:{querySelector(selector){return {focus(){focusTarget=selector;}};}},
      render(){rendered=context.reviewList(videos);},
    });
    vm.runInContext(routes+'\n'+back+'\n'+reviews+'\n'+click,context);
    return {context,ui,videos,click:()=>onClick,focus:()=>focusTarget,markup:()=>rendered};
  }
  test(`${file}: settings child routes return to their explicit origin`, () => {
    for (const name of ['education','estimate','announcements','support']) {
      const f=fixture(`#${name}?from=settings`);
      assert.equal(f.context.route().name,name);
      assert.equal(f.context.backHref(f.context.route()),'#settings');
    }
  });
  test(`${file}: existing guide return and route whitelist stay intact`, () => {
    const f=fixture('#education/dishwashing/3');
    assert.equal(f.context.backHref(f.context.route()),'#guide/dishwashing/3');
    f.context.location.hash='#guide/dishwashing/2.8';
    assert.equal(f.context.route().step,2);
    f.context.location.hash='#capture/dishwashing/3';
    assert.equal(f.context.route().name,'guide');
    f.context.location.hash='#constructor';
    assert.equal(f.context.route().name,'home');
  });
  test(`${file}: direct and hostile origins preserve safe defaults`, () => {
    for (const hash of ['#library','#library?from=outside','#library?from=https://example.test']) {
      const f=fixture(hash); assert.equal(f.context.route().name,'reviews'); assert.equal(f.context.backHref(f.context.route()),'#profile');
    }
    const f=fixture('#education/dishwashing/3');
    assert.equal(f.context.backHref(f.context.route()),'#guide/dishwashing/3');
  });
  test(`${file}: empty filtered results offer an explicit reset action`, () => {
    const f=fixture();
    assert.match(f.context.reviewList(f.videos),/data-app-action="reset-reviews"/);
    assert.match(f.context.reviewList([]),/href="#missions"/);
  });
  test(`${file}: real empty account and normal approved results remain distinct`, () => {
    const f=fixture();
    assert.match(f.context.reviewList([]),/href="#missions"/);
    f.ui.reviewFilter='approved';
    assert.match(f.context.reviewList(f.videos),/approved fixture/);
    assert.doesNotMatch(f.context.reviewList(f.videos),/전체 내역 보기/);
  });
  test(`${file}: reset action clears status and query without changing route`, async () => {
    for (const [filter,query] of [['rejected',''],['all','missing-title'],['rejected','missing-title']]) {
      const f=fixture(); f.ui.reviewFilter=filter; f.ui.reviewQuery=query;
      const target={dataset:{appAction:'reset-reviews'},removeAttribute(){},setAttribute(){}};
      const event={preventDefault(){},target:{closest(selector){return selector.includes('[data-app-action]')?target:null;}}};
      await f.click()(event);
      assert.equal(f.ui.reviewFilter,'all'); assert.equal(f.ui.reviewQuery,'');
      assert.equal(f.context.location.hash,'#reviews');
      assert.match(f.markup(),/approved fixture/);
      assert.equal(f.focus(),'[data-review-filter="all"]');
    }
  });
}
