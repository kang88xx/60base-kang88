// Address search for the EGO app. The app frames this page so Kakao's script never runs in the app itself.
// Only the chosen postcode and road-name address leave this page, and only to the app's own origins.
// Nothing is read from the parent and incoming messages are ignored.
(() => {
  const origins = ['capacitor://localhost', 'https://localhost', 'http://localhost:5183', 'http://127.0.0.1:5183'];
  // A browser that cannot target one of these origins (custom schemes) must still try the others.
  const send = message => { for (const origin of origins) { try { window.parent.postMessage({ source: 'ego-postcode', ...message }, origin); } catch {} } };
  if (window.parent === window) return;
  let failed = false;
  const fail = () => { if (!failed) { failed = true; send({ type: 'error' }); } };
  const host = document.getElementById('postcode'), script = document.createElement('script');
  script.src = 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  script.onerror = fail;
  script.onload = () => {
    try {
      const Postcode = window.kakao?.Postcode || window.daum?.Postcode;
      if (typeof Postcode !== 'function') throw new Error('Postcode is unavailable');
      document.getElementById('postcode-direct').hidden = true; host.hidden = false;
      new Postcode({ width: '100%', height: '100%', oncomplete: data => {
        const zonecode = String(data?.zonecode ?? ''), address = String(data?.roadAddress || data?.address || '');
        if (/^\d{5}$/.test(zonecode) && address) send({ type: 'selected', zonecode, address }); else fail();
      } }).embed(host);
      send({ type: 'ready' });
    } catch { fail(); }
  };
  document.head.append(script);
})();
