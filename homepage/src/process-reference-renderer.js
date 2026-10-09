// Original 60BASE process artwork, copied from:
// base60-kang88/assets/opalhaus-requested/process-diagrams.js
// Geometry, easing and finite 4,800ms timeline are unchanged. Only neutral
// colors vary for the white renewal section; orange remains the source color.
export const PROCESS_DURATION = 4800;

export function createProcessRenderer(drawing, step, theme = 'dark') {
  const document = drawing.ownerDocument || globalThis.document;
  const NS = 'http://www.w3.org/2000/svg';
  const ORANGE = '#ff5d17';
  const WHITE = theme === 'light' ? '#303030' : '#dedede';
  const LINE = '#777';
  const MUTED = theme === 'light' ? '#666' : '#999';
  const CELL = theme === 'light' ? '#e9e9e9' : '#202020';
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x); };
  const lerp = (a, b, amount) => a + (b - a) * amount;
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
      diamond(250, cy, 330, 155, group, index === 0 ? WHITE : MUTED);
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
      return element('rect', { x: x + 1, y: y + 1, width: 62, height: 62, fill: CELL, opacity: 0 });
    });
    for (let i = 0; i <= 4; i++) {
      element('line', { x1: 122 + i * 64, y1: 102, x2: 122 + i * 64, y2: 358, stroke: MUTED, 'stroke-width': 1 });
      element('line', { x1: 122, y1: 102 + i * 64, x2: 378, y2: 102 + i * 64, stroke: MUTED, 'stroke-width': 1 });
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

  return [radial, samples, production, delivery][step]();
}
