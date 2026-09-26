(function(global){
'use strict';
const arrow='<svg viewBox="0 0 256 256" fill="none" aria-hidden="true"><path d="M40 128h176m-72-72 72 72-72 72" stroke="currentColor" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const bend='<svg viewBox="0 0 13.167 14.667" aria-hidden="true"><path d="M8.25 0H0v1.833h6.417v9.325L2.796 7.537 1.5 8.833l5.833 5.834 5.834-5.834-1.296-1.296-3.621 3.621Z" fill="currentColor"/></svg>';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function progress(t,c=65,k=400){const a=(-c+Math.sqrt(c*c-4*k))/2,b=(-c-Math.sqrt(c*c-4*k))/2;return 1+(b*Math.exp(a*t)-a*Math.exp(b*t))/(a-b)}
function mount(host,{items=[],part='section',demo=false,reveal=false}={}){
 if(!host)throw new Error('Service host required');
 const root=document.createElement('div');root.className='opal-services';root.dataset.selected='0';
 root.style.setProperty('--service-row-ease','linear('+Array.from({length:91},(_,i)=>progress(i/60).toFixed(6)).join(',')+')');
 const links=items.map((item,i)=>part==='hero'?`<a class="opal-hero-service-link" href="${esc(item.href)}" aria-label="${esc(item.heroLabel||item.label)}"><span class="opal-service-roll" aria-hidden="true"><span>${esc(item.heroLabel||item.label)}</span><span>${esc(item.heroLabel||item.label)}</span></span><span class="opal-service-roll" aria-hidden="true"><span>${esc(item.number)}</span><span>${esc(item.number)}</span></span></a>`:`<a class="opal-service-row" href="${esc(item.href)}" data-index="${i}"><span class="opal-service-name"><span class="opal-service-number">${esc(item.number)}.</span><span class="opal-service-label">${esc(item.label)}</span></span><span class="opal-service-arrow">${arrow}</span><span class="opal-service-underline"></span></a>`).join('');
 root.innerHTML=part==='hero'?`<nav class="opal-hero-services" aria-label="What we do"><div class="opal-hero-services-header"><span>What we do</span>${bend}</div>${links}</nav>`:`<section class="opal-service-section" aria-label="Services"><header class="opal-service-header"><span class="opal-service-kicker"><i aria-hidden="true"></i>SERVICE</span><h2 class="opal-service-heading">Timeless design<br>to solutions</h2></header><div class="opal-service-layout"><nav class="opal-service-rows" aria-label="Our services">${links}</nav><div class="opal-service-media" aria-hidden="true"><div class="opal-service-track">${items.map(item=>`<img class="opal-service-image" src="${esc(item.image)}" alt="">`).join('')}</div></div></div></section>`;
 host.append(root);let animations=[];let observer;
 const media=matchMedia('(prefers-reduced-motion: reduce)');const reduced=()=>media.matches||document.documentElement.dataset.reducedMotion==='true';
 function select(i){if(!items[i])return;root.dataset.selected=String(i);const track=root.querySelector('.opal-service-track');if(track)track.style.transform=`translateY(${-i*248}px)`;}
 root.querySelectorAll('a').forEach((a,i)=>{a.addEventListener('mouseenter',()=>{if(innerWidth>=1200)select(i)});a.addEventListener('focus',()=>select(i));if(demo)a.addEventListener('click',event=>{event.preventDefault();host.dispatchEvent(new CustomEvent('opal:service-activate',{bubbles:true,detail:{href:a.href,index:i}}))});});
 function replay(){animations.forEach(a=>a.cancel());animations=[];if(reduced()||part==='hero'||innerWidth<1200)return;const target=root.querySelector('.opal-service-rows');const frames=Array.from({length:121},(_,i)=>{const p=progress(i/60,100);return {opacity:p,transform:`translateY(${150*(1-p)}px)`,offset:i/120}});frames[120]={opacity:1,transform:'translateY(0)',offset:1};animations.push(target.animate(frames,{duration:2000,delay:200,fill:'backwards'}));}
 function sync(){if(reduced())animations.forEach(a=>a.cancel())}
 media.addEventListener('change',sync);global.addEventListener('opal:motion-change',sync);const mutation=new MutationObserver(sync);mutation.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduced-motion']});
 if(reveal){observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){replay();observer.disconnect()}},{threshold:.5});observer.observe(root)}
 return {element:root,select,replay,destroy(){observer?.disconnect();mutation.disconnect();animations.forEach(a=>a.cancel());media.removeEventListener('change',sync);global.removeEventListener('opal:motion-change',sync);root.remove()}};
}
global.OpalServices={mount};
})(window);
