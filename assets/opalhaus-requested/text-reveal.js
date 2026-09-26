/* Opalhaus authored text effects, translated into native WAAPI. No dependencies. */
(() => {
  'use strict';
  const instances = new Set();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => media.matches || document.documentElement.dataset.reducedMotion === 'true';
  function spring(t, damping=100, stiffness=400, mass=1) {
    const w=Math.sqrt(stiffness/mass),z=damping/(2*Math.sqrt(stiffness*mass));
    if(Math.abs(z-1)<1e-8)return 1-(1+w*t)*Math.exp(-w*t);
    if(z<1){const wd=w*Math.sqrt(1-z*z);return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+z*w/wd*Math.sin(wd*t));}
    const r1=-w*(z-Math.sqrt(z*z-1)),r2=-w*(z+Math.sqrt(z*z-1));return 1-(r2*Math.exp(r1*t)-r1*Math.exp(r2*t))/(r2-r1);
  }
  function mount(target, options={}) {
    const host=typeof target==='string'?document.querySelector(target):target;if(!host)return null;
    [...instances].filter(instance=>instance.host===host).forEach(instance=>instance.destroy());
    const mode=options.mode||'characters';
    const lines=options.lines||(mode==='group'?['Timeless design','to solutions']:['Opalhaus®','Visual Collective ']);
    const config={mode,trigger:mode==='group'?'viewport':'onMount',threshold:.5,once:true,startDelay:mode==='group'?0:.1,stagger:.05,duration:.4,y:mode==='group'?150:10,opacity:mode==='group'?0:.001,blur:mode==='group'?0:10,damping:100,stiffness:400,mass:1,disabledBelow:mode==='group'?810:0,...options};
    const animations=new Set();let observer,played=false,disposed=false;
    host.replaceChildren();host.classList.add('opal-text-reveal');host.dataset.revealMode=mode;
    const group=document.createElement('div');group.className='opal-text-reveal__group';
    if(options.label !== false) {const label=document.createElement('div');label.className='opal-text-reveal__label';label.textContent=options.label??(mode==='group'?'SERVICE':'BRAND ARCHITECTS');group.append(label);}
    const heading=document.createElement(options.headingTag||'h2');heading.className='opal-text-reveal__heading';
    heading.setAttribute('aria-label',lines.map(s=>s.trim()).join(' '));
    const visual=document.createElement('span');visual.className='opal-text-reveal__visual';visual.setAttribute('aria-hidden','true');
    let index=0;
    lines.forEach((line,lineIndex)=>{
      const lineNode=document.createElement('span');lineNode.className='opal-text-reveal__line';lineNode.dataset.line=String(lineIndex);
      if(mode==='characters'){
        // Preserve words as wrapping units; index includes spaces, continues across source blocks.
        line.split(/(\s+)/).filter(Boolean).forEach(word=>{
          const wordNode=document.createElement('span');wordNode.className='opal-text-reveal__word';
          [...word].forEach(char=>{const node=document.createElement('span');node.className='opal-text-reveal__char';node.textContent=char;node.dataset.index=String(index++);wordNode.append(node);});
          lineNode.append(wordNode);
        });
      }else lineNode.textContent=line;
      visual.append(lineNode);
    });heading.append(visual);group.append(heading);host.append(group);
    function stop(){animations.forEach(animation=>animation.cancel());animations.clear();}
    function play(){
      if(disposed)return;stop();played=true;
      if(reduced() || (config.disabledBelow && innerWidth<config.disabledBelow)){host.dataset.revealState='static';return;}
      host.dataset.revealState='playing';
      const nodes=mode==='characters'?[...host.querySelectorAll('.opal-text-reveal__char')]:[group];
      let duration=config.duration;
      if(mode==='group'){duration=.1;while(duration<4&&Math.abs(1-spring(duration,config.damping,config.stiffness,config.mass))>.001)duration+=1/120;}
      const label=host.querySelector('.opal-text-reveal__label');
      if(mode==='characters' && label){
        let labelDuration=.1;while(labelDuration<4&&Math.abs(1-spring(labelDuration,66))>.001)labelDuration+=1/120;
        const count=Math.ceil(labelDuration*120);
        const frames=Array.from({length:count+1},(_,i)=>({opacity:i===count?1:.001+.999*spring(i/120,66)}));
        const animation=label.animate(frames,{duration:labelDuration*1000,delay:300,easing:'linear',fill:'backwards'});
        animations.add(animation);animation.addEventListener('finish',()=>animations.delete(animation),{once:true});
      }
      let pending=nodes.length;
      nodes.forEach((node,i)=>{
        const steps=Math.ceil(duration*120);
        const frames=Array.from({length:steps+1},(_,step)=>{
          const t=step/steps;
          // The .4s / bounce0 duration spring is a normalized critical response, explicitly a renderer approximation.
          const progress=step===steps?1:mode==='group'?spring(t*duration,config.damping,config.stiffness,config.mass):(1-(1+9.233*t)*Math.exp(-9.233*t))/(1-10.233*Math.exp(-9.233));
          return {opacity:config.opacity+(1-config.opacity)*progress,transform:`translateY(${config.y*(1-progress)}px)`,filter:`blur(${config.blur*(1-progress)}px)`};
        });
        const animation=node.animate(frames,{duration:duration*1000,delay:(config.startDelay+(mode==='characters'?i*config.stagger:0))*1000,easing:'linear',fill:'backwards'});
        animations.add(animation);animation.addEventListener('finish',()=>{animations.delete(animation);if(--pending===0)host.dataset.revealState='complete';},{once:true});
      });
    }
    function observe(){
      observer?.disconnect();
      observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting&&(!played||!config.once)){play();if(config.once)observer.disconnect();}}),{threshold:config.threshold});observer.observe(host);
    }
    const onPreference=()=>{if(reduced() || (config.disabledBelow&&innerWidth<config.disabledBelow)){stop();host.dataset.revealState='static';}};
    const controller=new AbortController();const signal=controller.signal;
    media.addEventListener('change',onPreference,{signal});window.addEventListener('opal:motion-change',onPreference,{signal});window.addEventListener('resize',onPreference,{signal});
    const mutation=new MutationObserver(onPreference);mutation.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduced-motion']});
    const instance={host,play,replay:play,destroy(){disposed=true;stop();observer?.disconnect();mutation.disconnect();controller.abort();instances.delete(instance);}};
    instances.add(instance);
    if(config.trigger==='viewport')observe();else if(config.trigger!=='manual')play();
    return instance;
  }
  function destroy(){[...instances].forEach(instance=>instance.destroy());}
  window.OpalTextReveal={mount,destroy,spring};
})();
