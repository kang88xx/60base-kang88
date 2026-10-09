import {applyArtworkInk} from './variation-artwork.js';

const DURATION = 9000;
const SOURCE = '/assets/media/service-reference/';

function element(parent, className, text = '', style = {}) {
  const node = document.createElement('div');
  node.className = className;
  node.textContent = text;
  Object.assign(node.style, style);
  parent.append(node);
  return node;
}

function art(parent, source, crop, x, y, width, className = '') {
  const [cx, cy, cw, ch] = crop;
  const box = element(parent, `variation-art ${className}`, '', {
    left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${width * ch / cw}px`,
  });
  const image = document.createElement('img');
  image.className = 'scene-asset';
  image.alt = '';
  image.draggable = false;
  // The same final source-video frame at its native 1280×720 resolution.
  // Keep the original 1120×630 crop coordinates as the logical art space.
  image.dataset.lightSrc = `${SOURCE}thesis-${source}-light-source.png`;
  image.dataset.darkSrc = `${SOURCE}thesis-${source}-dark-poster.jpg`;
  image.src = image.dataset.lightSrc;
  Object.assign(image.style, {
    width: `${1120 / cw * 100}%`, height: `${630 / ch * 100}%`,
    left: `${-cx / cw * 100}%`, top: `${-cy / ch * 100}%`,
  });
  box.append(image);
  applyArtworkInk(box, image, {source, crop, width});
  return box;
}

function label(parent, text, x, y, extra = '') {
  return element(parent, `variation-label ${extra}`, text, { left: `${x}px`, top: `${y}px` });
}

export function createScene(id, canvas) {
  canvas.classList.add('scene-canvas', `variation-scene-${id}`);
  const animations = [];
  const motion = (node, frames, easing = 'cubic-bezier(.23,1,.32,1)') => {
    const animation = node.animate(frames.map(([at, value]) => ({ offset: at / DURATION, easing, ...value })), {
      duration: DURATION, iterations: 1, fill: 'both', easing: 'linear',
    });
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
  };
  const pose = (transform = 'none', opacity = 1) => ({ transform, opacity });
  const reveal = (node, at, initial = 'translateY(12px)') => motion(node, [
    [0, pose(initial, 0)], [at, pose(initial, 0)], [at + 500, pose()],
    [8000, pose()], [9000, pose(initial, 0)],
  ]);
  label(canvas, `EXPERIMENT 0${id}`, 24, 20, 'variation-eyebrow');
  label(canvas, 'POSEIDON / MOTION STUDIES', 411, 20, 'variation-eyebrow');
  let phases;

  if (id === 1) {
    phases = [{ at: 0, label: 'Observe / 원본 관찰' }, { at: 1800, label: 'Repeat / 동작 분해' }, { at: 4000, label: 'Learn / 표현 학습' }];
    const line = element(canvas, 'variation-rule', '', { left: '93px', top: '164px', width: '454px' });
    reveal(line, 500);
    const cards = [
      art(canvas, 4, [434, 99, 182, 164], 45, 100, 156),
      art(canvas, 1, [415, 146, 329, 296], 242, 100, 156),
      art(canvas, 4, [659, 94, 187, 169], 439, 100, 156),
    ];
    cards.forEach((card, i) => {
      const stack = `translateX(${(1 - i) * 197}px) translateY(${i * 5}px) rotate(${(i - 1) * 5}deg)`;
      motion(card, [[0, pose(stack, i === 0 ? 1 : 0.22)], [400 + i * 280, pose(stack, i === 0 ? 1 : 0.22)], [1600 + i * 450, pose()], [7900, pose()], [9000, pose(stack, i === 0 ? 1 : 0.22)]]);
      const caption = label(canvas, ['01 / OBSERVE', '02 / REPEAT', '03 / LEARN'][i], 45 + i * 197, 259);
      reveal(caption, 1300 + i * 800);
      const sub = label(canvas, ['HUMAN DEMONSTRATION', 'ACTION DECOMPOSITION', 'LEARNED REPRESENTATION'][i], 45 + i * 197, 278, 'variation-muted');
      reveal(sub, 1500 + i * 800);
    });
    const cursor = element(canvas, 'variation-cursor', '', { left: '45px', top: '313px' });
    element(canvas, 'variation-rule variation-dotted', '', { left: '45px', top: '318px', width: '550px' });
    motion(cursor, [[0, pose('translateX(0)', 0)], [1300, pose('translateX(0)', 1)], [2200, pose('translateX(78px)')], [3800, pose('translateX(275px)')], [5300, pose('translateX(472px)')], [7900, pose('translateX(550px)')], [8500, pose('translateX(550px)', 0)], [9000, pose('translateX(0)', 0)]], 'linear');
  } else if (id === 2) {
    phases = [{ at: 0, label: 'Capture / 현장 수집' }, { at: 2400, label: 'Acquire / 동시 유입' }, { at: 4900, label: 'Organize / 태스크 정렬' }];
    const inputs = [
      [2, [558, 81, 211, 81], 'DISHWASH', -170, -80],
      [2, [439, 295, 174, 233], 'IRONING', 30, -140],
      [2, [680, 392, 116, 79], 'BRUSHING', 170, -40],
      [4, [436, 100, 177, 157], 'DUMPLING', -160, 70],
      [3, [866, 290, 214, 315], 'SHOELACE', -10, 150],
      [2, [80, 391, 113, 145], 'PLATING', 180, 90],
    ];
    inputs.forEach(([source, crop, name, dx, dy], i) => {
      const x = 54 + i % 3 * 184;
      const y = 69 + Math.floor(i / 3) * 132;
      const card = element(canvas, 'variation-acquisition', '', { left: `${x}px`, top: `${y}px`, width: '164px', height: '118px' });
      const width = Math.min(132, 83 * crop[2] / crop[3]);
      art(card, source, crop, (164 - width) / 2, 8, width, 'variation-art-unframed');
      label(card, `${String(i + 1).padStart(2, '0')} / ${name}`, 7, 100);
      label(card, '● REC', 120, 8, 'variation-rec');
      const start = `translate(${dx}px, ${dy}px) rotate(${i % 2 ? 9 : -8}deg)`;
      motion(card, [[0, pose(start, i === 0 ? 0.8 : 0)], [200 + i * 430, pose(start, i === 0 ? 0.8 : 0)], [1500 + i * 530, pose(`translate(${dx / 8}px, ${dy / 8}px) rotate(${i % 2 ? -2 : 2}deg)`, 1)], [4800 + i * 120, pose()], [7900, pose()], [9000, pose(start, i === 0 ? 0.8 : 0)]]);
    });
    const counter = label(canvas, '06 SOURCES   /   06 HUMAN TASKS   /   ONE COLLECTION', 54, 335, 'variation-muted');
    reveal(counter, 5100);
  } else if (id === 3) {
    phases = [{ at: 0, label: 'Inspect / 품질 검사' }, { at: 1900, label: 'Scan / 적합성 판별' }, { at: 4400, label: 'Select / 유효 데이터 선별' }];
    const cards = [0, 1, 2].map((i) => {
      const node = art(canvas, 3, [865, 286, 216, 319], 105 + i * 154, 75, 126);
      const initial = `translateX(${(1 - i) * 154}px) rotate(${(i - 1) * 8}deg)`;
      motion(node, [[0, pose(initial, i === 1 ? 1 : 0.35)], [700, pose(initial, i === 1 ? 1 : 0.35)], [1800, pose()], [3700, pose()], [5200, i === 1 ? pose('translateX(-104px)') : pose(`translateY(30px) rotate(${(i - 1) * 9}deg)`, 0)], [7900, i === 1 ? pose('translateX(-104px)') : pose(`translateY(30px) rotate(${(i - 1) * 9}deg)`, 0)], [9000, pose(initial, i === 1 ? 1 : 0.35)]]);
      const status = label(canvas, i === 1 ? 'ACCEPT / 01' : ['REJECT / 00', '', 'REJECT / 02'][i], 105 + i * 154, 282, i === 1 ? '' : 'variation-muted');
      if (i === 1) reveal(status, 3900);
      else motion(status, [[0, pose('none', 0)], [3700, pose('none', 0)], [4100, pose()], [4450, pose()], [5200, pose('translateY(16px)', 0)], [9000, pose('none', 0)]]);
      if (i === 1) motion(status, [[0, { transform: 'none' }], [3700, { transform: 'none' }], [5200, { transform: 'translateX(-104px)' }], [7900, { transform: 'translateX(-104px)' }], [9000, { transform: 'none' }]]);
      return node;
    });
    const scan = element(canvas, 'variation-scan', '', { left: '99px', top: '76px', width: '447px' });
    motion(scan, [[0, pose('translateY(0)', 0)], [1900, pose('translateY(0)')], [3600, pose('translateY(186px)')], [3900, pose('translateY(186px)', 0)], [9000, pose('translateY(0)', 0)]], 'linear');
    ['✓ SYNCHRONIZED', '✓ CONTROLLED SOURCE', '✓ NATURAL ACTIVITY'].forEach((text, i) => {
      const rail = element(canvas, 'variation-validation', text, { left: '335px', top: `${106 + i * 43}px`, width: '211px' });
      reveal(rail, 4600 + i * 430, 'translateX(20px)');
    });
    const result = label(canvas, 'QUALITY IS A FILTER, NOT A VOLUME.', 155, 329, 'variation-muted');
    reveal(result, 6000);
  } else if (id === 4) {
    phases = [{ at: 0, label: 'Align / 스트림 정렬' }, { at: 2000, label: 'Synchronize / 타임코드 동기화' }, { at: 4900, label: 'Package / 학습 패킷 생성' }];
    const tracks = element(canvas, 'variation-track-group');
    const crops = [[4, [434, 100, 181, 162]], [4, [659, 94, 187, 169]], [1, [415, 146, 329, 296]]];
    crops.forEach(([source, crop], i) => {
      const track = element(tracks, 'variation-track', '', { left: '67px', top: `${72 + i * 78}px`, width: '506px', height: '65px' });
      label(track, ['RGB', 'DEPTH', 'ANNOTATION'][i], 9, 8);
      label(track, ['30 FPS', '16 BIT', 'ACTION ID'][i], 9, 39, 'variation-muted');
      for (let j = 0; j < 5; j++) art(track, source, crop, 123 + j * 72, 7, 51, 'variation-art-unframed');
      motion(track, [[0, pose(`translateX(${i % 2 ? 180 : -180}px)`, i === 0 ? 0.65 : 0)], [i * 400, pose(`translateX(${i % 2 ? 180 : -180}px)`, i === 0 ? 0.65 : 0)], [1300 + i * 400, pose()], [4300, pose()], [5400, pose(`translateY(${(1 - i) * 78}px) scaleX(.35)`, 0)], [8100, pose(`translateY(${(1 - i) * 78}px) scaleX(.35)`, 0)], [9000, pose(`translateX(${i % 2 ? 180 : -180}px)`, i === 0 ? 0.65 : 0)]]);
    });
    const scan = element(canvas, 'variation-sync-scan', '', { left: '189px', top: '66px', height: '232px' });
    motion(scan, [[0, pose('translateX(0)', 0)], [2100, pose('translateX(0)')], [4100, pose('translateX(350px)')], [4500, pose('translateX(350px)', 0)], [9000, pose('translateX(0)', 0)]], 'linear');
    const packet = element(canvas, 'variation-packet', '', { left: '148px', top: '100px', width: '344px', height: '178px' });
    label(packet, 'DATASET / DELIVERY 001', 15, 14);
    art(packet, 4, [434, 100, 181, 162], 17, 49, 102, 'variation-art-unframed');
    label(packet, 'MODEL-READY', 143, 57, 'variation-packet-title');
    label(packet, 'RGB + DEPTH + ACTION', 143, 87, 'variation-muted');
    label(packet, 'SYNC  00:00:04.20', 143, 109, 'variation-muted');
    label(packet, '✓ SCHEMA VALIDATED', 143, 138);
    motion(packet, [[0, pose('scale(.7)', 0)], [4800, pose('scale(.7)', 0)], [5900, pose()], [8100, pose()], [8800, pose('scale(.7)', 0)], [9000, pose('scale(.7)', 0)]]);
    const footer = label(canvas, 'ALIGNED STREAMS → ONE TRAINING UNIT', 176, 323, 'variation-muted');
    reveal(footer, 5600);
  } else {
    throw new RangeError(`Unknown thesis variation: ${id}`);
  }
  return { animations, duration: DURATION, phases };
}
