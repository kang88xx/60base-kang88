/* Site content adapter. The four adjacent Opalhaus component files are unmodified. */
(() => {
  'use strict';
  const root = document.documentElement;
  const heroHost = document.getElementById('hero-motion-heading');
  const indexHost = document.querySelector('.hero-index');
  const services = document.getElementById('purchase-process');
  const serviceHost = document.getElementById('process-motion-host');
  const fallback = services?.querySelector('.process-fallback');
  if (!heroHost || !indexHost || !serviceHost || !fallback || !window.OpalTextReveal || !window.OpalServices || !window.SixtyBaseProcessMotion) return;

  const fallbackHeading = fallback.querySelector('h2');
  const cards = [...fallback.querySelectorAll('.process-source-step')];
  if (!fallbackHeading || cards.length !== 4) return;
  let instances = [];
  let serviceInstance;
  const t = key => window.siteI18n?.t(key) ?? key;

  function mount() {
    const previousSelection = Number(serviceInstance?.element.dataset.selected || 0);
    const pending = [];
    try {
      const heroStage = document.createElement('div');
      const indexStage = document.createElement('div');
      const serviceStage = document.createElement('div');
      const english = (window.siteI18n?.language || root.lang) === 'en';
      const hero = window.OpalTextReveal.mount(heroStage, {
        mode: 'characters', headingTag: 'h1', label: 'PHYSICAL AI · ACTION DATA',
        lines: english ? ['Human actions.', 'Data for physical AI.'] : ['로봇이 배울 동작,', '필요한 데이터로.'],
      });
      if (!hero) throw new Error('Hero motion could not mount');
      pending.push(hero);
      heroStage.querySelector('h1').id = 'hero-heading';
      heroStage.querySelector('.opal-text-reveal__label').classList.add('section-label');
      const index = window.OpalServices.mount(indexStage, {
        part: 'hero', demo: false,
        items: [
          ['data', 'Data purchase'], ['services', 'Custom collection'],
          ['standards', 'Annotation & review'], ['contact', 'Project inquiry'],
        ].map(([id, label], i) => ({ href: `#${id}`, label: t(label), number: String(i + 1).padStart(2, '0') })),
      });
      pending.push(index);
      const indexLabel = t('What we do');
      index.element.querySelector('nav').setAttribute('aria-label', indexLabel);
      index.element.querySelector('.opal-hero-services-header').remove();

      const list = window.OpalServices.mount(serviceStage, {
        part: 'section', demo: false, reveal: true,
        items: cards.map((card, i) => {
          return { label: card.querySelector('.step-title').textContent.trim(), number: String(i + 1).padStart(2, '0'),
            image: '', href: '#purchase-process' };
        }),
      });
      pending.push(list);
      list.element.querySelector('.opal-service-section').setAttribute('aria-label', t('Data purchase and production steps'));
      list.element.querySelector('.opal-service-rows').setAttribute('aria-label', t('Data purchase and production steps'));
      const rows = [...list.element.querySelectorAll('.opal-service-row')];
      let diagram;
      const selectStep = index => {
        list.select(index);
        diagram?.select(index);
        rows.forEach((row, i) => {
          row.setAttribute('aria-pressed', String(i === index));
          row.dataset.hover = String(i === index);
        });
      };
      rows.forEach((link, i) => {
        link.setAttribute('role', 'button');
        link.setAttribute('aria-controls', 'process-step-image');
        link.addEventListener('click', event => { event.preventDefault(); selectStep(i); });
        link.addEventListener('keydown', event => {
          if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); selectStep(i); }
        });
        link.addEventListener('mouseenter', () => { if (innerWidth >= 1200) selectStep(i); });
        link.addEventListener('focus', () => selectStep(i));
        const label = link.querySelector('.opal-service-label');
        const title = document.createElement('h3');
        title.textContent = label.textContent;
        const description = document.createElement('p');
        description.className = 'process-row-description';
        description.textContent = cards[i].querySelector('.step-copy').textContent;
        const detail = document.createElement('p');
        detail.className = 'process-row-detail';
        detail.textContent = cards[i].querySelector('.panel-extra').textContent;
        label.replaceChildren(title, description, detail);
      });
      const heading = window.OpalTextReveal.mount(list.element.querySelector('.opal-service-header'), {
        mode: 'group', headingTag: 'h2', label: 'HOW IT WORKS',
        lines: fallbackHeading.textContent.trim().split(/\n+/).filter(Boolean),
      });
      if (!heading) throw new Error('Service heading motion could not mount');
      pending.push(heading);
      heading.host.querySelector('h2').id = 'process-heading';
      heading.host.querySelector('.opal-text-reveal__group').classList.add('section-title');
      heading.host.querySelector('.opal-text-reveal__label').classList.add('section-label');
      const processImage = list.element.querySelector('.opal-service-media');
      processImage.id = 'process-step-image';
      diagram = window.SixtyBaseProcessMotion.mount(processImage, {
        english,
        labels: cards.map(card => card.querySelector('.step-title').textContent.trim()),
        onSelect: selectStep,
      });
      pending.push(diagram);
      selectStep(previousSelection);

      // Commit only after every component is ready, retaining the original content on failure.
      instances.forEach(instance => instance.destroy());
      fallbackHeading.id = 'process-fallback-heading';
      heroHost.replaceChildren(heroStage);
      indexHost.replaceChildren(index.element);
      serviceHost.replaceChildren(list.element);
      fallback.hidden = true;
      services.classList.add('process-motion-active');
      root.dataset.requestedMotionReady = 'true';
      instances = pending;
      serviceInstance = list;
    } catch (error) {
      pending.forEach(instance => instance.destroy());
      console.error('Requested homepage motion could not initialize', error);
    }
  }

  window.addEventListener('languagechange', mount);
  mount();
})();
