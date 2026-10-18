// 60BASE process artwork, 시안 C "치수선 · 도면" (2026-10-18).
// Replaces the original opalhaus-derived diagrams with technical-drawing
// shapes: dimension lines, a split comparison, aligned tracks and a checklist.
// The finite 4,800ms timeline, easing and 500×440 stage are unchanged so the
// ProcessMotion scheduler (play once, loop on hover) works as before.
export const PROCESS_DURATION = 4800;

export function createProcessRenderer(drawing, step, theme = 'dark') {
  const document = drawing.ownerDocument || globalThis.document;
  const NS = 'http://www.w3.org/2000/svg';
  const ACCENT = '#0024FF';
  const INK = theme === 'light' ? '#303030' : '#dedede';
  const LINE = '#777';
  const MUTED = theme === 'light' ? '#666' : '#999';
  const CELL = theme === 'light' ? '#e9e9e9' : '#202020';
  const CX = 250, CY = 230;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x); };
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const f1 = n => Number(n).toFixed(1);
  function element(tag, attributes, parent = drawing) {
    const node = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    parent.append(node);
    return node;
  }
  function set(node, values) {
    for (const [name, value] of Object.entries(values)) node.setAttribute(name, value);
  }
  // Outlined artwork uses stroke-width 1 + fill none so process-motion.css
  // keeps it at a crisp 1px (non-scaling stroke) on the compact stage.
  const hair = (attrs, parent) => element('line', { stroke: LINE, 'stroke-width': 1, ...attrs }, parent);
  const outline = (tag, attrs, parent) => element(tag, { fill: 'none', 'stroke-width': 1, ...attrs }, parent);

  // 01 Tell us what you need — a scope rectangle is drawn, then dimension
  // lines measure its width and height while a blue marker rides the edges.
  function dimension() {
    const B = { x: 140, y: 150, w: 200, h: 150 };
    const box = outline('rect', { x: B.x, y: B.y, width: B.w, height: B.h, stroke: INK, pathLength: 1, 'stroke-dasharray': '0 1' });
    const extT = [hair({ x1: B.x, y1: B.y - 8, x2: B.x, y2: B.y - 46, opacity: 0 }), hair({ x1: B.x + B.w, y1: B.y - 8, x2: B.x + B.w, y2: B.y - 46, opacity: 0 })];
    const extR = [hair({ x1: B.x + B.w + 8, y1: B.y, x2: B.x + B.w + 46, y2: B.y, opacity: 0 }), hair({ x1: B.x + B.w + 8, y1: B.y + B.h, x2: B.x + B.w + 46, y2: B.y + B.h, opacity: 0 })];
    const dimT = hair({ x1: B.x, y1: B.y - 36, x2: B.x, y2: B.y - 36, stroke: INK });
    const dimR = hair({ x1: B.x + B.w + 36, y1: B.y, x2: B.x + B.w + 36, y2: B.y, stroke: INK });
    const tick = (x, y, vertical) => hair(vertical ? { x1: x, y1: y - 7, x2: x, y2: y + 7, stroke: INK, opacity: 0 } : { x1: x - 7, y1: y, x2: x + 7, y2: y, stroke: INK, opacity: 0 });
    const ticksT = [tick(B.x, B.y - 36, true), tick(B.x + B.w, B.y - 36, true)];
    const ticksR = [tick(B.x + B.w + 36, B.y, false), tick(B.x + B.w + 36, B.y + B.h, false)];
    const cross = element('g', { opacity: 0 });
    hair({ x1: CX - 14, y1: CY - 5, x2: CX + 14, y2: CY - 5, stroke: MUTED }, cross);
    hair({ x1: CX, y1: CY - 19, x2: CX, y2: CY + 9, stroke: MUTED }, cross);
    const mark = element('rect', { x: B.x - 7, y: B.y - 7, width: 14, height: 14, fill: ACCENT, opacity: 0 });
    return t => {
      const s = t / 1000;
      set(box, { 'stroke-dasharray': `${smooth((s - .1) / 1.1).toFixed(4)} 1` });
      set(cross, { opacity: smooth((s - .9) / .4) * .8 });
      extT.forEach(l => set(l, { opacity: smooth((s - 1.2) / .4) * .9 }));
      extR.forEach(l => set(l, { opacity: smooth((s - 2.2) / .4) * .9 }));
      const dt = smooth((s - 1.4) / 1.0), dr = smooth((s - 2.4) / 1.0);
      set(dimT, { x2: f1(lerp(B.x, B.x + B.w, dt)) });
      set(dimR, { y2: f1(lerp(B.y, B.y + B.h, dr)) });
      set(ticksT[0], { opacity: smooth((s - 1.3) / .2) }); set(ticksT[1], { opacity: smooth((s - 2.3) / .2) });
      set(ticksR[0], { opacity: smooth((s - 2.3) / .2) }); set(ticksR[1], { opacity: smooth((s - 3.3) / .2) });
      const mx = lerp(B.x, B.x + B.w, dt), my = lerp(B.y, B.y + B.h, dr);
      const settle = smooth((s - 3.5) / .6);
      const size = 14 + settle * 6;
      set(mark, { x: f1(mx - size / 2), y: f1(my - size / 2), width: f1(size), height: f1(size), opacity: smooth((s - 1.2) / .3) });
    };
  }

  // 02 Review a sample — reference and sample frames side by side; a blue
  // divider wipes across the sample, then the sample frame is approved.
  function split() {
    const L = { x: 110, y: 140, w: 136, h: 180 }, R = { x: 254, y: 140, w: 136, h: 180 };
    const left = outline('rect', { x: L.x, y: L.y, width: L.w, height: L.h, stroke: LINE, opacity: 0 });
    const wipe = element('rect', { x: R.x, y: R.y, width: 0, height: R.h, fill: CELL, opacity: 0 });
    const right = outline('rect', { x: R.x, y: R.y, width: R.w, height: R.h, stroke: LINE, opacity: 0 });
    const rows = [0, 1, 2, 3].map(i => {
      const y = 170 + i * 36;
      return {
        a: element('rect', { x: L.x + 20, y, width: 0, height: 5, fill: INK }),
        b: element('rect', { x: R.x + 20, y, width: 0, height: 5, fill: INK }),
        la: 96 - (i % 2) * 30, lb: 96 - ((i + 1) % 2) * 30,
      };
    });
    const divider = element('line', { x1: R.x, y1: R.y - 18, x2: R.x, y2: R.y + R.h + 18, stroke: ACCENT, 'stroke-width': 1.7, opacity: 0 });
    const handle = element('rect', { x: R.x - 6, y: R.y - 30, width: 12, height: 12, fill: ACCENT, opacity: 0 });
    const approve = outline('rect', { x: R.x, y: R.y, width: R.w, height: R.h, stroke: ACCENT, opacity: 0 });
    return t => {
      const s = t / 1000;
      const ok = smooth((s - 3.5) / .6);
      set(left, { opacity: smooth(s / .4) * (1 - ok * .5) });
      set(right, { opacity: smooth((s - .15) / .4) });
      rows.forEach(({ a, b, la, lb }, i) => {
        set(a, { width: f1(la * smooth((s - .5 - i * .12) / .5)) });
        set(b, { width: f1(lb * smooth((s - .65 - i * .12) / .5)) });
      });
      const p = smooth((s - 1.6) / 1.5);
      const x = lerp(R.x, R.x + R.w, p);
      const vis = smooth((s - 1.5) / .3) * (1 - smooth((s - 3.5) / .5));
      set(wipe, { width: f1(x - R.x), opacity: smooth((s - 1.5) / .3) * .9 });
      set(divider, { x1: f1(x), x2: f1(x), opacity: vis });
      set(handle, { x: f1(x - 6), opacity: vis });
      set(approve, { opacity: ok });
    };
  }

  // 03 Collect & prepare — footage, annotation and review-record tracks slide
  // in over a ruler; their blue markers align to one sync point.
  function align() {
    const ROWS = [{ y: 170, mark: 230 }, { y: 230, mark: 150 }, { y: 290, mark: 330 }];
    const X0 = 100;
    const ruler = hair({ x1: X0, y1: 330, x2: X0 + 300, y2: 330, opacity: 0 });
    const rulerTicks = Array.from({ length: 11 }, (_, i) => hair({ x1: X0 + i * 30, y1: 330, x2: X0 + i * 30, y2: i % 5 ? 336 : 342, opacity: 0 }));
    const tracks = ROWS.map(({ y }) => element('rect', { x: X0, y: y - 9, width: 300, height: 18, fill: CELL, stroke: MUTED, 'stroke-width': 1, opacity: 0 }));
    const marks = ROWS.map(({ y }) => element('rect', { x: 0, y: y - 9, width: 10, height: 18, fill: ACCENT, opacity: 0 }));
    const sync = element('line', { x1: CX, y1: CY, x2: CX, y2: CY, stroke: ACCENT, 'stroke-width': 1, opacity: 0 });
    return t => {
      const s = t / 1000;
      set(ruler, { opacity: smooth(s / .4) * .9 });
      rulerTicks.forEach((l, i) => set(l, { opacity: smooth((s - .1 - i * .03) / .3) * .9 }));
      const aligned = smooth((s - 2.5) / .9);
      ROWS.forEach(({ mark }, i) => {
        const enter = smooth((s - .5 - i * .55) / .9);
        const dx = lerp(-320, 0, enter);
        set(tracks[i], { transform: `translate(${f1(dx)} 0)`, opacity: enter });
        set(marks[i], { x: f1(lerp(mark, CX, aligned) - 5 + dx), opacity: enter });
      });
      const grow = smooth((s - 3.4) / .6);
      set(sync, { opacity: smooth((s - 3.4) / .5), y1: f1(lerp(CY, 150, grow)), y2: f1(lerp(CY, 310, grow)) });
    };
  }

  // 04 Review & deliver — a checklist is ticked top to bottom by a blue review
  // line, then closed with a blue outline.
  function checklist() {
    const N = 5, Y0 = 134, GAP = 48, BX = 128, LX = 164;
    const lens = [190, 150, 210, 120, 170];
    const rows = Array.from({ length: N }, (_, i) => {
      const y = Y0 + i * GAP;
      return {
        y,
        box: outline('rect', { x: BX, y: y - 9, width: 18, height: 18, stroke: MUTED, opacity: 0 }),
        fill: element('rect', { x: BX + 3, y: y - 6, width: 12, height: 12, fill: INK, opacity: 0 }),
        line: element('rect', { x: LX, y: y - 2.5, width: 0, height: 5, fill: INK, opacity: .9 }),
      };
    });
    const scan = element('line', { x1: 108, y1: Y0, x2: 392, y2: Y0, stroke: ACCENT, 'stroke-width': 1.7, opacity: 0 });
    const frame = outline('rect', { x: 108, y: Y0 - 28, width: 284, height: GAP * (N - 1) + 56, stroke: ACCENT, opacity: 0 });
    return t => {
      const s = t / 1000;
      rows.forEach(({ box, line }, i) => {
        const enter = smooth((s - .1 - i * .12) / .4);
        set(box, { opacity: enter });
        set(line, { width: f1(lens[i] * enter) });
      });
      const p = smooth((s - 1.2) / 2.0);
      const sy = lerp(Y0 - 20, Y0 + GAP * (N - 1) + 20, p);
      set(scan, { y1: f1(sy), y2: f1(sy), opacity: smooth((s - 1.1) / .3) * (1 - smooth((s - 3.3) / .4)) });
      rows.forEach(({ y, fill }) => set(fill, { opacity: smooth((sy - y) / 10) }));
      set(frame, { opacity: smooth((s - 3.5) / .7) });
    };
  }

  return [dimension, split, align, checklist][step]();
}
