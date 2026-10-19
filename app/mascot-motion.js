const POSTER = '/app/icons/mascot-purple-3d-20261019.png';

export function mascotMotion(variant = 'welcome') {
  return `<ego-mascot-motion variant="${variant === 'processing' ? 'processing' : 'welcome'}" aria-hidden="true"></ego-mascot-motion>`;
}

class EgoMascotMotion extends HTMLElement {
  connectedCallback() {
    this.preference = matchMedia('(prefers-reduced-motion: reduce)');
    this.onPreference = () => this.render();
    this.preference.addEventListener('change', this.onPreference);
    this.render();
  }

  disconnectedCallback() {
    this.preference?.removeEventListener('change', this.onPreference);
    this.shadowRoot?.querySelector('video')?.pause();
  }

  render() {
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.querySelector('video')?.pause();
    const variant = this.getAttribute('variant') === 'processing' ? 'processing' : 'welcome';
    const base = `/app/icons/mascot-${variant}-loop-20261019`;
    root.innerHTML = `<style>
      :host { display:block; width:108px; height:96px; pointer-events:none; }
      .art { position:relative; width:100%; height:100%; }
      img,video { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
      img.static { object-fit:cover; scale:1.3893; }
      [hidden] { display:none; }
    </style><span class="art" style="display:block"><img class="static" src="${POSTER}" alt=""></span>`;
    if (this.preference.matches) return;
    const art = root.querySelector('.art');
    const fallback = root.querySelector('img');
    const useGif = () => {
      if (!this.isConnected || this.preference.matches || this.shadowRoot !== root || !art.isConnected) return;
      art.querySelector('video')?.remove();
      fallback.hidden = false;
      fallback.className = '';
      fallback.onerror = () => { fallback.onerror = null; fallback.className = 'static'; fallback.src = POSTER; };
      fallback.src = `${base}.gif`;
    };
    // Safari can decode VP9 while dropping alpha. Use transparent GIF there,
    // and reserve WebM for Chromium's known VP9-alpha renderer.
    const chromium = /(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent) && !/iP(?:hone|ad|od)/.test(navigator.userAgent);
    const video = document.createElement('video');
    if (!chromium || !video.canPlayType('video/webm; codecs="vp9"')) { useGif(); return; }
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.poster = POSTER;
    video.hidden = true;
    video.setAttribute('aria-hidden', 'true');
    video.addEventListener('playing', () => { video.hidden = false; fallback.hidden = true; }, { once:true });
    video.addEventListener('error', useGif, { once:true });
    video.src = `${base}.webm`;
    art.appendChild(video);
    video.play().catch(useGif);
  }
}

if (!customElements.get('ego-mascot-motion')) customElements.define('ego-mascot-motion', EgoMascotMotion);
