import { useEffect, useRef } from 'react';
import './promo-reference-widget.js';
import './fixed-promo.css';

// Production artwork, spring and unpublished-store behavior.
// Sources: /assets/opalhaus-promo/{promo-widget,60base-promo}.js.
const slides = [
  ['android-01.svg', 'Android · 60BASE'],
  ['android-02.svg', 'Android App · Physical AI Studio'],
  ['android-03.svg', '60BASE · Android'],
  ['android-04.svg', 'Physical AI Studio · Android'],
].map(([file, alt]) => ({ src: `/assets/promo/${file}`, alt }));

function disableStoreLink(link, platform) {
  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = true;
  button.className = link.className;
  button.title = `${platform} app — coming soon`;
  button.append(...link.childNodes);
  link.replaceWith(button);
  return button;
}

export function FixedPromo({ language = 'en' }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = window.OpalPromo.mount(host, {
      slides, href: '#app-download-dialog', bannerHref: '#app-download-dialog',
      demo: false, part: 'combined', scale: 1, fixed: false,
    });
    const banner = disableStoreLink(host.querySelector('.opal-promo-banner'), 'Android');
    const buy = disableStoreLink(host.querySelector('.opal-promo-buy'), 'iOS');
    buy.querySelector('.opal-promo-label-main').textContent = 'App Store';
    buy.querySelector('.opal-promo-label-alt').textContent = 'iOS App';
    const apple = document.createElement('img');
    apple.className = 'opal-promo-bolt base60-apple-icon';
    apple.src = '/assets/promo/platform-apple.svg';
    apple.alt = '';
    apple.setAttribute('aria-hidden', 'true');
    buy.querySelector('.opal-promo-bolt').replaceWith(apple);

    const badge = document.createElement('a');
    badge.className = 'base60-training-badge';
    badge.href = '/app/#home';
    badge.setAttribute('aria-label', language === 'en' ? 'EGO · Open the contributor app' : '에고 EGO · 촬영 참여 앱 열기');
    const symbol = document.createElement('img');
    symbol.src = '/app/icons/icon.svg';
    symbol.alt = '';
    symbol.width = 32;
    symbol.height = 32;
    const label = document.createElement('span');
    label.innerHTML = language === 'en'
      ? '<span>EGO</span><span>CONTRIBUTOR APP</span>'
      : '<span>에고 EGO</span><span>내 시점이 AI가 된다</span>';
    badge.append(symbol, label);
    controller.element.querySelector('.opal-promo-inner').append(badge);

    function syncLabels() {
      const index = Number(controller.element.dataset.slide) || 0;
      banner.setAttribute('aria-label', `${slides[index].alt} — Android app coming soon`);
      buy.setAttribute('aria-label', 'App Store — iOS app coming soon');
    }
    const observer = new MutationObserver(syncLabels);
    observer.observe(controller.element, { attributes: true, attributeFilter: ['data-slide'] });
    syncLabels();
    return () => {
      observer.disconnect();
      controller.destroy();
    };
  }, [language]);

  return <aside id="fixed-promo-host" className="fixed-promo-dock" ref={hostRef} aria-label={language === 'en' ? 'EGO contributor app by 60BASE' : '60BASE의 촬영 참여 앱 에고'} />;
}
