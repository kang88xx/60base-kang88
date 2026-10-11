import { useEffect, useRef } from 'react';
import './promo-reference-widget.js';
import './fixed-promo.css';

// Keep Android's unpublished-store behavior; iOS has a verified public listing.
// Sources: /assets/opalhaus-promo/{promo-widget,60base-promo}.js.
const APP_STORE_URL = 'https://apps.apple.com/kr/app/id6813374012';
const slides = [
  ['android-01.svg', 'ego APP · Android'],
  ['android-02.svg', 'ego APP · Android · Physical AI Studio'],
  ['android-03.svg', 'ego APP · Android'],
  ['android-04.svg', 'ego APP · Physical AI Studio · Android'],
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
      slides, href: APP_STORE_URL, bannerHref: '#app-download-dialog',
      demo: false, part: 'combined', scale: 1, fixed: false,
    });
    const banner = disableStoreLink(host.querySelector('.opal-promo-banner'), 'Android');
    const buy = host.querySelector('.opal-promo-buy');
    buy.title = language === 'en' ? 'Download ego APP on the App Store' : 'App Store에서 ego APP 다운로드';
    buy.querySelector('.opal-promo-label-main').textContent = 'App Store';
    buy.querySelector('.opal-promo-label-alt').textContent = language === 'en' ? 'Download' : '다운로드';
    const apple = document.createElement('img');
    apple.className = 'opal-promo-bolt base60-apple-icon';
    apple.src = '/assets/promo/platform-apple.svg';
    apple.alt = '';
    apple.setAttribute('aria-hidden', 'true');
    buy.querySelector('.opal-promo-bolt').replaceWith(apple);

    const badge = document.createElement('button');
    badge.className = 'base60-training-badge';
    badge.type = 'button';
    badge.disabled = true;
    badge.title = language === 'en' ? 'EGO contributor app — coming soon' : '에고 EGO · 촬영 참여 앱 준비 중';
    badge.setAttribute('aria-label', badge.title);
    const symbol = document.createElement('img');
    symbol.src = '/app/icons/symbol.svg';
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
      banner.setAttribute('aria-label', language === 'en' ? `${slides[index].alt} — Android app coming soon` : 'ego APP · Android 앱 출시 예정');
      buy.setAttribute('aria-label', language === 'en' ? 'ego APP · Download on the App Store (opens in a new tab)' : 'ego APP · App Store에서 다운로드 (새 탭)');
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
