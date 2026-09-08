/* Koreo site runtime. Dependency-free. Hero scene is an independent reconstruction of the
   Lusion "kinetic field" idea (rounded cross modules, matcap-like shading), native WebGL with a Canvas 2D fallback. */
(() => {
  'use strict';
  const BRAND = 'KOREO';           // change once: wordmark + footer follow
  const BRAND_TITLE = 'Koreo';
  document.documentElement.classList.remove('no-js');
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  document.querySelectorAll('[data-brand]').forEach((el) => { el.textContent = BRAND; });
  document.querySelectorAll('[data-brand-title]').forEach((el) => { el.textContent = BRAND_TITLE; });

  /* ---------- toast ---------- */
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('visible'), 2600);
  }

  /* ---------- menu ---------- */
  const menu = $('menu'), openBtn = $('menu-open');
  let returnFocus = null;
  function openMenu() {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : openBtn;
    menu.showModal();
    openBtn.setAttribute('aria-expanded', 'true');
    const firstLink = menu.querySelector('a,button');
    if (firstLink) firstLink.focus();
  }
  function closeMenu(restore = true) {
    if (menu.open) menu.close();
    openBtn.setAttribute('aria-expanded', 'false');
    if (restore && returnFocus) returnFocus.focus();
  }
  openBtn.addEventListener('click', openMenu);
  $('menu-close').addEventListener('click', closeMenu);
  menu.addEventListener('click', (e) => { if (e.target === menu) closeMenu(); });
  menu.addEventListener('close', () => openBtn.setAttribute('aria-expanded', 'false'));
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { closeMenu(false); }));

  /* ---------- header theme (dark over hero scene) ---------- */
  const header = $('header'), scene = $('scene');
  function headerTheme() {
    const r = scene.getBoundingClientRect();
    header.classList.toggle('on-dark', r.top < 40 && r.bottom > 60);
    header.classList.toggle('scrolled', r.bottom <= 60);
  }
  addEventListener('scroll', headerTheme, { passive: true }); headerTheme();

  /* ---------- reveal on scroll ---------- */
  const revealer = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); revealer.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
  document.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = `${(i % 3) * 60}ms`; revealer.observe(el); });

  /* ---------- Seoul clock ---------- */
  function tick() {
    try { $('clock').textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date()); } catch { $('clock').textContent = '--:--'; }
  }
  tick(); setInterval(tick, 15000);

  /* ---------- contact form: browser-local draft only ---------- */
  const form = $('contact-form'), status = $('form-status');
  const draftKey = 'koreo:inquiry-draft';
  function readDraft() {
    try { return JSON.parse(localStorage.getItem(draftKey) || '{}'); } catch { return {}; }
  }
  function writeDraft() {
    const draft = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim(),
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
      return true;
    } catch {
      status.textContent = 'Local browser storage is unavailable. You can still edit the draft on this page.';
      return false;
    }
  }
  function setInvalid(field, invalid) {
    field.setAttribute('aria-invalid', String(invalid));
  }
  const restored = readDraft();
  if (restored.name || restored.email || restored.message) {
    form.name.value = restored.name || '';
    form.email.value = restored.email || '';
    form.message.value = restored.message || '';
    status.textContent = 'Restored your browser-local inquiry draft. You can keep editing it.';
  }
  form.addEventListener('input', () => {
    setInvalid(form.name, false);
    setInvalid(form.email, false);
    setInvalid(form.message, false);
    writeDraft();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.name.value.trim(), email = form.email.value.trim(), msg = form.message.value.trim();
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    setInvalid(form.name, !name);
    setInvalid(form.email, !emailOk);
    setInvalid(form.message, !msg);
    if (!name || !emailOk || !msg) {
      status.textContent = 'Please add your name, a valid work email and a short brief.';
      return;
    }
    if (writeDraft()) {
      status.textContent = 'Inquiry draft saved locally. It stays editable in this browser and was not sent.';
    }
  });
  $('draft-clear').addEventListener('click', () => {
    try {
      localStorage.removeItem(draftKey);
      form.reset();
      [form.name, form.email, form.message].forEach((field) => setInvalid(field, false));
      status.textContent = 'Local draft cleared from this browser.';
    } catch {
      status.textContent = 'Local browser storage could not be cleared. Your editable draft remains on this page.';
    }
  });
  $('copy-email').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('hello@koreodata.com');
      toast('Email copied');
    } catch {
      toast('Email: hello@koreodata.com');
    }
  });

  /* ---------- hero scene ---------- */
  const canvas = $('hero-canvas'), pointer = { x: 0, y: 0 };
  const bodies = Array.from({ length: 11 }, (_, i) => ({
    x: ((i % 4) - 1.5) * 1.64 + (i > 7 ? .7 : 0), y: (Math.floor(i / 4) - 1) * 1.48,
    z: Math.sin(i * 4.1) * 1.1, offset: [0, 0], velocity: [0, 0], phase: i * 2.399,
  }));
  const colors = [[.91, .89, .82], [.045, .05, .06], [.045, .12, .95]];
  let t = 0, palette = 0, raf = 0, previous = 0, visible = true, render = null;

  function running() { return !reduced.matches && !document.hidden && visible; }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = previous ? Math.min((now - previous) / 1000, .05) : 0; previous = now;
    const live = running(); if (live) t += dt;
    bodies.forEach((b) => {
      for (let k = 0; k < 2; k++) {
        b.velocity[k] += -b.offset[k] * 6 * dt - b.velocity[k] * 2.6 * dt;
        b.offset[k] += b.velocity[k] * dt;
      }
    });
    const { w, h } = fit(canvas); if (render) render(w, h);
    if (live) requestDraw();
  }
  function fit(c) {
    const r = c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    return { w: c.width, h: c.height };
  }
  function burst() {
    palette = (palette + 1) % 3;
    if (running()) bodies.forEach((b, i) => { b.velocity[0] += Math.cos(i * 2.399) * 5; b.velocity[1] += Math.sin(i * 2.399) * 5; });
    requestDraw();
  }
  function crossGeometry() {
    const positions = [], normals = [], steps = 8, bevel = .2;
    for (let bar = 0; bar < 3; bar++) {
      const half = [.32, .32, .32]; half[bar] = 1.03;
      for (let axis = 0; axis < 3; axis++) for (const side of [-1, 1]) {
        const u = (axis + 1) % 3, v = (axis + 2) % 3;
        const point = (i, j) => {
          const a = [0, 0, 0]; a[axis] = half[axis] * side; a[u] = (i / steps * 2 - 1) * half[u]; a[v] = (j / steps * 2 - 1) * half[v];
          const inner = a.map((x, k) => clamp(x, -half[k] + bevel, half[k] - bevel));
          const n = a.map((x, k) => x - inner[k]), len = Math.hypot(...n) || 1;
          return { p: inner.map((x, k) => x + n[k] / len * bevel), n: n.map((x) => x / len) };
        };
        for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) {
          const c = [point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)];
          for (const k of [0, 1, 2, 0, 2, 3]) { positions.push(...c[k].p); normals.push(...c[k].n); }
        }
      }
    }
    return { positions, normals };
  }
  function program(gl, vs, fs) {
    const sh = [];
    for (const [kind, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(kind); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); sh.push(s);
    }
    const p = gl.createProgram(); sh.forEach((s) => gl.attachShader(p, s)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p); return p;
  }
  function buffer(gl, p, name, values, size) {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  function rotation(b) { return [b.phase + t * .18 + pointer.y * .4, b.phase * .7 + t * .23 + pointer.x * .65, Math.sin(t * .22 + b.phase) * .3]; }

  function initWebGL() {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
    if (!gl) throw new Error('WebGL unavailable');
    const p = program(gl, `attribute vec3 aPosition; attribute vec3 aNormal;
      uniform vec3 uRotation; uniform vec3 uPosition; uniform float uAspect; uniform float uScale;
      varying vec3 vNormal; varying vec3 vPosition;
      vec3 rotate(vec3 p){vec3 c=cos(uRotation),s=sin(uRotation);
        p=vec3(p.x,p.y*c.x-p.z*s.x,p.y*s.x+p.z*c.x);
        p=vec3(p.x*c.y+p.z*s.y,p.y,-p.x*s.y+p.z*c.y);
        return vec3(p.x*c.z-p.y*s.z,p.x*s.z+p.y*c.z,p.z);}
      void main(){vec3 p=rotate(aPosition*uScale)+uPosition;vNormal=rotate(aNormal);vPosition=p;
        float z=8.8+p.z;gl_Position=vec4(p.x*2.65/uAspect,p.y*2.65,z*1.01005-.201005,z);}`,
      `precision mediump float; varying vec3 vNormal; varying vec3 vPosition; uniform vec3 uColor;
      void main(){vec3 n=normalize(vNormal);vec3 light=normalize(vec3(-.5,1.,-1.5));
        vec3 view=normalize(vec3(0.,0.,-8.8)-vPosition);float diff=max(dot(n,light),0.);
        float spec=pow(max(dot(n,normalize(light+view)),0.),44.);
        float rim=pow(1.-max(dot(n,view),0.),3.);
        vec3 color=uColor*(.22+.78*diff)+vec3(.80,.85,1.)*spec*.8+vec3(.1,.13,.2)*rim;
        gl_FragColor=vec4(pow(color,vec3(.85)),1.);}`);
    const g = crossGeometry(); buffer(gl, p, 'aPosition', g.positions, 3); buffer(gl, p, 'aNormal', g.normals, 3);
    const u = Object.fromEntries(['uRotation', 'uPosition', 'uAspect', 'uScale', 'uColor'].map((n) => [n, gl.getUniformLocation(p, n)]));
    const count = g.positions.length / 3;
    render = (w, h) => {
      gl.viewport(0, 0, w, h); gl.clearColor(.047, .051, .059, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
      gl.uniform1f(u.uAspect, w / h);
      const narrow = w / h < 1, spread = narrow ? .65 : 1;
      bodies.forEach((b, i) => {
        gl.uniform3fv(u.uRotation, rotation(b));
        gl.uniform3f(u.uPosition, (b.x + b.offset[0]) * spread, b.y + b.offset[1] + (narrow ? .75 : .28), b.z);
        gl.uniform1f(u.uScale, narrow ? .54 : .84); gl.uniform3fv(u.uColor, colors[(i + palette) % 3]);
        gl.drawArrays(gl.TRIANGLES, 0, count);
      });
    };
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); initFallback(); });
  }
  function initFallback() {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    render = (w, h) => {
      ctx.fillStyle = '#0c0d0f'; ctx.fillRect(0, 0, w, h);
      const faces = [];
      const rot = (v, a, b) => { const [x, y, z] = v, yy = y * Math.cos(a) - z * Math.sin(a), zz = y * Math.sin(a) + z * Math.cos(a); return [x * Math.cos(b) + zz * Math.sin(b), yy, -x * Math.sin(b) + zz * Math.cos(b)]; };
      bodies.forEach((body, index) => {
        const [ra, rb] = rotation(body);
        for (let bar = 0; bar < 3; bar++) {
          const half = [.25, .25, .25]; half[bar] = .85;
          const pts = Array.from({ length: 8 }, (_, n) => rot(half.map((v, axis) => v * ((n >> axis & 1) ? 1 : -1)), ra, rb)).map((v) => [v[0] + (body.x + body.offset[0]) * (w < h ? .62 : 1), v[1] + body.y + body.offset[1] + .25, v[2] + body.z]);
          for (const f of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) {
            const coords = f.map((i) => pts[i]), z = coords.reduce((s, v) => s + v[2], 0) / 4;
            const color = colors[(index + palette) % 3].map((c) => Math.round(clamp(c * (.75 + f[0] * .04)) * 255));
            faces.push({ coords, z, color });
          }
        }
      });
      faces.sort((a, b) => b.z - a.z).forEach((f) => {
        ctx.beginPath(); f.coords.forEach((v, i) => { const s = h * 1.325 / (8.8 + v[2]); const x = w / 2 + v[0] * s, y = h / 2 - v[1] * s; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.closePath(); ctx.fillStyle = `rgb(${f.color.join(',')})`; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.stroke();
      });
    };
  }
  try { initWebGL(); } catch { initFallback(); }

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = clamp((e.clientX - r.left) / r.width, 0, 1) * 2 - 1; pointer.y = clamp((e.clientY - r.top) / r.height, 0, 1) * 2 - 1; requestDraw();
  });
  canvas.addEventListener('pointerleave', () => { pointer.x = pointer.y = 0; requestDraw(); });
  canvas.addEventListener('click', burst);
  canvas.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      pointer.x = clamp(pointer.x + (e.key === 'ArrowRight' ? .2 : e.key === 'ArrowLeft' ? -.2 : 0), -1, 1);
      pointer.y = clamp(pointer.y + (e.key === 'ArrowDown' ? .2 : e.key === 'ArrowUp' ? -.2 : 0), -1, 1); requestDraw();
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); burst(); }
  });
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) { previous = 0; requestDraw(); } }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; previous = 0; } else requestDraw(); });
  addEventListener('resize', requestDraw);
  reduced.addEventListener('change', () => { previous = 0; requestDraw(); });
  requestDraw();
})();
