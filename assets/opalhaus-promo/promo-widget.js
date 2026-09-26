/* Dependency-free native reconstruction of the published promotional widget. */
(function(global){
  'use strict';
  const bolt='<svg class="opal-promo-bolt" viewBox="0 0 11 11" aria-hidden="true"><path d="M5.441 11a.414.414 0 0 1-.414-.412V7.103l-2.92-.001a.413.413 0 0 1-.364-.609L5.177.215a.414.414 0 0 1 .778.197v3.492h2.938a.413.413 0 0 1 .364.609l-3.453 6.273a.414.414 0 0 1-.363.214Z"/></svg>';
  const spring=(t,k=200,c=40)=>{const a=(-c+Math.sqrt(c*c-4*k))/2,b=(-c-Math.sqrt(c*c-4*k))/2;return 1+(b*Math.exp(a*t)-a*Math.exp(b*t))/(a-b)};
  function mount(host,options={}) {
    if(!host)throw new Error('Promo host is required');
    const {slides=[],href='#',bannerHref='#',demo=false,part='combined',scale=1,fixed=false}=options;
    const root=document.createElement('div');root.className='opal-promo';root.dataset.part=part;root.dataset.fixed=String(fixed);root.style.setProperty('--promo-scale',scale);
    const inner=document.createElement('div');inner.className='opal-promo-inner';root.append(inner);
    let track,banner,index=0,timer,animation,paused=false,destroyed=false;
    const mq=matchMedia('(prefers-reduced-motion: reduce)');
    const reduced=()=>mq.matches||document.documentElement.dataset.reducedMotion==='true';
    function link(url,label,className){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.className=className;a.setAttribute('aria-label',label);if(demo)a.addEventListener('click',e=>{e.preventDefault();host.dispatchEvent(new CustomEvent('opal:promo-activate',{bubbles:true,detail:{href:url,label}}))});return a;}
    if(part!=='buy'){
      banner=link(bannerHref,'Explore Pentaclay promotions','opal-promo-banner');banner.innerHTML='<div class="opal-promo-viewport"><div class="opal-promo-track"></div></div>';track=banner.querySelector('.opal-promo-track');
      [...slides,...slides.slice(0,1)].forEach(slide=>{const img=document.createElement('img');img.className='opal-promo-slide';img.src=slide.src;img.alt='';img.draggable=false;img.setAttribute('aria-hidden','true');track.append(img)});inner.append(banner);
    }
    if(part!=='banner') {const buy=link(href,'Buy for $59 — template checkout','opal-promo-buy');buy.innerHTML='<span class="opal-promo-label opal-promo-label-main" aria-hidden="true">Buy for $59</span><span class="opal-promo-label opal-promo-label-alt" aria-hidden="true">Grab Now</span><span class="opal-promo-disc" aria-hidden="true"></span>'+bolt;inner.append(buy);}
    host.append(root);
    function schedule(){clearTimeout(timer);if(!destroyed&&!paused&&!reduced()&&!document.hidden&&slides.length>1&&track)timer=setTimeout(()=>{next();schedule()},3000)}
    function next(){if(!track||!slides.length)return;animation?.cancel();const from=index;index=(index+1)%slides.length;const to=from+1;root.dataset.slide=String(index);banner.setAttribute('aria-label',slides[index].alt+' — Explore Pentaclay');if(reduced()){track.style.transform=`translateY(${-index*100}%)`;return}const frames=Array.from({length:91},(_,i)=>({transform:`translateY(${-(from+spring(i/60))*100}%)`,offset:i/90}));frames[90].transform=`translateY(${-to*100}%)`;animation=track.animate(frames,{duration:1500,fill:'forwards',easing:'linear'});const active=animation;active.onfinish=()=>{track.style.transform=`translateY(${-index*100}%)`;active.cancel();};}
    function sync(){if(reduced()){animation?.cancel();if(track)track.style.transform=`translateY(${-index*100}%)`}schedule()}
    mq.addEventListener('change',sync);global.addEventListener('opal:motion-change',sync);document.addEventListener('visibilitychange',sync);
    const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduced-motion']});
    root.dataset.slide='0';schedule();
    return {element:root,next,pause(value=true){paused=value;schedule()},replay(){animation?.cancel();index=0;root.dataset.slide='0';if(track)track.style.transform='translateY(0)';schedule()},destroy(){destroyed=true;clearTimeout(timer);animation?.cancel();observer.disconnect();mq.removeEventListener('change',sync);global.removeEventListener('opal:motion-change',sync);document.removeEventListener('visibilitychange',sync);root.remove()}};
  }
  global.OpalPromo={mount};
})(window);
