/* Approved option 1: finite, locally rendered process diagrams. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const ORANGE = '#ff5d17';
  const WHITE = '#dedede';
  const LINE = '#777';
  const DURATION = 4800;
  let nextId = 0;
  function mount(host, { labels, english = false, onSelect = () => {} } = {}) {
    const root = document.createElement('div');
    root.className = 'process-diagrams';
    const id = `process-diagram-${++nextId}`;
    root.innerHTML = `<svg class="process-diagrams-stage" viewBox="0 0 500 440" role="img" aria-labelledby="${id}-title ${id}-description"><title id="${id}-title"></title><desc id="${id}-description"></desc><g transform="translate(0 -10)"></g></svg><div class="process-diagrams-minis"></div>`;
    host.replaceChildren(root);
    host.removeAttribute('aria-hidden');
    const svg = root.querySelector('.process-diagrams-stage');
    const drawing = svg.querySelector('g');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const isReduced = () => reduced.matches || document.documentElement.dataset.reducedMotion === 'true';
    const descriptions = english ? [
      'Eight points converge at the center to bring the recording requirements together.',
      'Samples align into a matrix and the selected sample is highlighted.',
      'Three layers assemble in sequence to represent production.',
      'A review line scans the grid and the reviewed files form a delivery package.'
    ] : [
      '여덟 방향의 점이 중앙으로 모여 촬영 요구사항을 하나로 정리합니다.',
      '흩어진 샘플이 일정한 간격으로 정렬되고 선택한 샘플이 강조됩니다.',
      '세 개의 층이 차례로 쌓이며 제작 과정을 표현합니다.',
      '검수선이 격자를 지나고 확인한 자료가 납품 묶음으로 완성됩니다.'
    ];
    const shortLabels = english ? ['Converge', 'Align', 'Produce', 'Deliver'] : ['수렴', '정렬', '제작', '납품'];
    const minisHost = root.querySelector('.process-diagrams-minis');
    minisHost.setAttribute('role', 'group');
    minisHost.setAttribute('aria-label', english ? 'Production steps' : '구매·제작 단계');
    shortLabels.forEach((label, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'process-diagrams-mini';
      button.dataset.step = String(i);
      button.setAttribute('aria-label', labels?.[i] || label);
      button.setAttribute('aria-controls', host.id);
      button.innerHTML = `<svg viewBox="0 0 100 84" aria-hidden="true" data-mini="${i}"></svg><span></span>`;
      button.querySelector('span').textContent = label;
      button.addEventListener('click', () => { onSelect(i); select(i, true); });
      minisHost.append(button);
    });
    const clamp = value => Math.max(0, Math.min(1, value));
    const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x); };
    const lerp = (a, b, amount) => a + (b - a) * amount;
    let step = -1, elapsed = 0, raf = 0, previous = 0, frame = 0;
    let visible = false, destroyed = false;
    let render = () => {};
  function element(tag, attributes, parent = drawing) {
    const node = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    parent.append(node);
    return node;
  }

  function set(node, values) {
    for (const [name, value] of Object.entries(values)) node.setAttribute(name, value);
  }

  function square(x, y, size, fill = WHITE, parent = drawing) {
    return element('rect', { x: x - size / 2, y: y - size / 2, width: size, height: size, fill }, parent);
  }

  function diamond(cx, cy, width, height, parent = drawing, stroke = WHITE) {
    return element('path', { d: `M${cx} ${cy - height / 2}L${cx + width / 2} ${cy}L${cx} ${cy + height / 2}L${cx - width / 2} ${cy}Z`, fill: 'none', stroke, 'stroke-width': 1.2 }, parent);
  }

  function radial() {
    const spokes = Array.from({ length: 8 }, (_, i) => {
      const angle = i * Math.PI / 4 - Math.PI / 2;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const line = element('line', { x1: 250, y1: 230, x2: 250 + dx * 190, y2: 230 + dy * 190, stroke: LINE, 'stroke-width': .9 });
      const end = square(250 + dx * 190, 230 + dy * 190, 9);
      const packet = square(250 + dx * 96, 230 + dy * 96, 9, ORANGE);
      return { dx, dy, line, end, packet };
    });
    const hub = square(250, 230, 29, ORANGE);
    return t => {
      const seconds = t / 1000;
      spokes.forEach(({ dx, dy, line, end, packet }, i) => {
        const enter = smooth((seconds - i * .025) / .55);
        const inward = smooth((seconds - 1 - i * .095) / 1.65);
        const settle = smooth((seconds - 3.55) / .9);
        const radius = lerp(lerp(96, 0, inward), 96, settle);
        set(line, { x2: 250 + dx * 190 * enter, y2: 230 + dy * 190 * enter, opacity: .25 + .75 * enter });
        set(end, { opacity: .3 + .7 * enter });
        set(packet, { x: 250 + dx * radius - 4.5, y: 230 + dy * radius - 4.5, opacity: enter });
      });
      const pulse = Math.sin(clamp((seconds - 2.1) / 1.5) * Math.PI);
      const size = 29 + pulse * 7;
      set(hub, { x: 250 - size / 2, y: 230 - size / 2, width: size, height: size });
    };
  }

  function samples() {
    const nodes = Array.from({ length: 9 }, (_, i) => {
      const x = 250 + (i % 3 - 1) * 84;
      const y = 230 + (Math.floor(i / 3) - 1) * 84;
      const angle = i * 2.399;
      const startX = 250 + Math.cos(angle) * (145 + i % 3 * 12);
      const startY = 230 + Math.sin(angle) * (145 + i % 3 * 12);
      const node = square(x, y, 43, i === 4 ? ORANGE : WHITE);
      return { x, y, startX, startY, node };
    });
    const outline = element('rect', { x: 217, y: 197, width: 66, height: 66, fill: 'none', stroke: ORANGE, 'stroke-width': 1, opacity: 0 });
    return t => {
      const seconds = t / 1000;
      nodes.forEach(({ x, y, startX, startY, node }, i) => {
        const amount = smooth((seconds - i * .12) / 1.6);
        const size = lerp(9, 43, amount);
        set(node, { x: lerp(startX, x, amount) - size / 2, y: lerp(startY, y, amount) - size / 2, width: size, height: size, opacity: .5 + .5 * amount });
      });
      set(outline, { opacity: smooth((seconds - 2.4) / .7) * .65 });
    };
  }

  function production() {
    const layers = [2, 1, 0].map(index => {
      const group = element('g', {});
      const cy = 165 + index * 65;
      diamond(250, cy, 330, 155, group, index === 0 ? WHITE : '#999');
      return { group, cy, index };
    });
    const marker = diamond(250, 165, 25, 13, drawing, ORANGE);
    marker.setAttribute('fill', ORANGE);
    return t => {
      const seconds = t / 1000;
      layers.forEach(({ group, index }) => {
        const amount = smooth((seconds - (2 - index) * .65) / 1.4);
        set(group, { transform: `translate(0 ${lerp(-75, 0, amount)})`, opacity: .08 + .92 * amount });
      });
      const arrival = smooth((seconds - 2.5) / .9);
      set(marker, { transform: `translate(0 ${lerp(-70, 0, arrival)})`, opacity: arrival });
    };
  }

  function delivery() {
    const cells = Array.from({ length: 16 }, (_, i) => {
      const x = 122 + i % 4 * 64;
      const y = 102 + Math.floor(i / 4) * 64;
      return element('rect', { x: x + 1, y: y + 1, width: 62, height: 62, fill: '#202020', opacity: 0 });
    });
    for (let i = 0; i <= 4; i++) {
      element('line', { x1: 122 + i * 64, y1: 102, x2: 122 + i * 64, y2: 358, stroke: '#999', 'stroke-width': 1 });
      element('line', { x1: 122, y1: 102 + i * 64, x2: 378, y2: 102 + i * 64, stroke: '#999', 'stroke-width': 1 });
    }
    const scan = element('line', { x1: 118, y1: 102, x2: 382, y2: 102, stroke: ORANGE, 'stroke-width': 1.7 });
    const completed = element('rect', { x: 315, y: 103, width: 62, height: 62, fill: ORANGE, opacity: 0 });
    return t => {
      const seconds = t / 1000;
      const progress = smooth((seconds - .4) / 2.8);
      cells.forEach((cell, i) => set(cell, { opacity: smooth((progress * 16 - i) / 2) * .75 }));
      set(scan, { y1: lerp(102, 358, progress), y2: lerp(102, 358, progress), opacity: (1 - smooth((seconds - 3.3) / .5)) * smooth(seconds / .4) });
      set(completed, { opacity: smooth((seconds - 3.3) / .8) });
    };
  }

  function minis() {
    root.querySelectorAll('[data-mini]').forEach(mini => {
      const index = Number(mini.dataset.mini);
      if (index === 0) {
        [[20, 15.5], [47, 21.5], [73, 15.5], [83, 39.5], [68, 68.5], [40, 64.5], [17, 52.5], [31, 37.5]].forEach(([x, y]) => square(x, y, 4, WHITE, mini));
        square(50, 42, 7, ORANGE, mini);
      } else if (index === 1) {
        for (let i = 0; i < 9; i++) square(29 + i % 3 * 21, 21 + Math.floor(i / 3) * 21, 10, i === 4 ? ORANGE : WHITE, mini);
      } else if (index === 2) {
        [56, 42, 28].forEach(y => diamond(50, y, 88, 41, mini));
        const mark = diamond(50, 28, 11, 7, mini, ORANGE); mark.setAttribute('fill', ORANGE);
      } else {
        for (let i = 0; i <= 4; i++) {
          element('line', { x1: 14 + i * 18, y1: 6, x2: 14 + i * 18, y2: 78, stroke: '#aaa', 'stroke-width': .8 }, mini);
          element('line', { x1: 14, y1: 6 + i * 18, x2: 86, y2: 6 + i * 18, stroke: '#aaa', 'stroke-width': .8 }, mini);
        }
        element('rect', { x: 69, y: 7, width: 16, height: 16, fill: ORANGE }, mini);
      }
    });
  }


    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      previous = 0;
    }
    function schedule() {
      const active = !destroyed && visible && !document.hidden && !isReduced() && elapsed < DURATION;
      svg.dataset.state = isReduced() ? 'static' : elapsed >= DURATION ? 'finished' : active ? 'running' : 'paused';
      if (active && !raf) raf = requestAnimationFrame(tick);
    }
    function tick(now) {
      raf = 0;
      if (destroyed || !visible || document.hidden || isReduced()) return;
      if (previous) elapsed = Math.min(DURATION, elapsed + Math.max(0, now - previous));
      previous = now;
      render(elapsed);
      svg.dataset.frame = String(++frame);
      schedule();
    }
    function select(next, force = false) {
      if (destroyed || !Number.isInteger(next) || next < 0 || next > 3 || (next === step && !force)) return;
      stop();
      step = next;
      frame = 0;
      root.dataset.activeStep = String(step);
      drawing.replaceChildren();
      render = [radial, samples, production, delivery][step]();
      svg.querySelector('title').textContent = labels?.[step] || shortLabels[step];
      svg.querySelector('desc').textContent = descriptions[step];
      minisHost.querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-pressed', String(i === step)));
      elapsed = isReduced() ? DURATION : 0;
      svg.dataset.frame = '0';
      render(elapsed);
      schedule();
    }
    function syncVisibility() { stop(); schedule(); }
    function syncReduced() { select(step, true); }
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      syncVisibility();
    }, { threshold: 0 });
    observer.observe(host);
    const mutation = new MutationObserver(syncReduced);
    mutation.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    document.addEventListener('visibilitychange', syncVisibility);
    reduced.addEventListener('change', syncReduced);
    minis();
    select(0);
    return { element: root, select: next => select(next, true), destroy() {
      destroyed = true;
      stop();
      observer.disconnect();
      mutation.disconnect();
      reduced.removeEventListener('change', syncReduced);
      document.removeEventListener('visibilitychange', syncVisibility);
      root.remove();
    } };
  }
  window.SixtyBaseProcessMotion = { mount };
})();
