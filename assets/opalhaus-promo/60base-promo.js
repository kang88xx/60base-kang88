/* 60BASE app links reuse the supplied promo motion without altering vendor code. */
(function () {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  // Set only verified, owner-provided listing URLs here.
  const storeUrls = { android: null, ios: null };
  function mount() {
    const host = document.getElementById('fixed-promo-host');
    if (!host || host.dataset.promoMounted === 'true' || !window.OpalPromo) return;
    const slides = [
      ['android-01.svg', 'Android · 60BASE'],
      ['android-02.svg', 'Android App · Physical AI Studio'],
      ['android-03.svg', '60BASE · Android'],
      ['android-04.svg', 'Physical AI Studio · Android'],
    ].map(([file, alt]) => ({ src: new URL(`android/${file}`, base).href, alt }));
    host.setAttribute('role', 'complementary');
    host.setAttribute('aria-label', '60BASE app downloads');
    host.dataset.promoMounted = 'true';
    const controller = window.OpalPromo.mount(host, {
      slides, href: storeUrls.ios || '#app-download-dialog',
      bannerHref: storeUrls.android || '#app-download-dialog',
      demo: false, part: 'combined', scale: 1, fixed: false,
    });
    function disableStoreLink(link, platform) {
      const button = document.createElement('button');
      button.type = 'button'; button.disabled = true; button.className = link.className;
      button.title = `${platform} app — coming soon`;
      button.append(...link.childNodes); link.replaceWith(button);
      return button;
    }
    const banner = storeUrls.android ? host.querySelector('.opal-promo-banner') : disableStoreLink(host.querySelector('.opal-promo-banner'), 'Android');
    const buy = storeUrls.ios ? host.querySelector('.opal-promo-buy') : disableStoreLink(host.querySelector('.opal-promo-buy'), 'iOS');
    buy.querySelector('.opal-promo-label-main').textContent = 'App Store';
    buy.querySelector('.opal-promo-label-alt').textContent = 'iOS App';
    const apple = document.createElement('img');
    apple.className = 'opal-promo-bolt base60-apple-icon';
    apple.src = new URL('../icons/platform-apple.svg', base).href;
    apple.alt = ''; apple.setAttribute('aria-hidden', 'true');
    buy.querySelector('.opal-promo-bolt').replaceWith(apple);
    function syncLabels() {
      const index = Number(controller.element.dataset.slide) || 0;
      banner.setAttribute('aria-label', `${slides[index].alt}${storeUrls.android ? '' : ' — Android app coming soon'}`);
      buy.setAttribute('aria-label', storeUrls.ios ? 'App Store — 60BASE' : 'App Store — iOS app coming soon');
    }
    const observer = new MutationObserver(syncLabels);
    observer.observe(controller.element, { attributes: true, attributeFilter: ['data-slide'] });
    syncLabels();
    const badge = document.createElement('a');
    badge.className = 'base60-training-badge'; badge.href = './studio/';
    badge.setAttribute('aria-label', '60BASE Studio · Physical AI Training Data');
    const symbol = document.createElement('img');
    symbol.src = new URL('../brand/60base-logo3-20260914/service-favicon.png', base).href;
    symbol.alt = ''; symbol.width = 32; symbol.height = 32;
    const label = document.createElement('span');
    label.innerHTML = '<span>PHYSICAL AI</span><span>TRAINING DATA</span>';
    badge.append(symbol, label);
    controller.element.querySelector('.opal-promo-inner').append(badge);
    const destroy = controller.destroy.bind(controller);
    controller.destroy = () => { observer.disconnect(); destroy(); delete host.dataset.promoMounted; };
    window.SixtyBasePromo = controller;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
