// Display-only ink masks. Original poster files remain untouched; the artwork
// now uses the same final frame decoded losslessly from the 1280×720 source MP4.
// Four samples per logical pixel allow small stroke corrections without the
// whole-pixel jumps of SVG morphology on scaled raster images.
const SCALE = 4;
const masks = new Map();
const sources = new Map();

// Editing handles baked into the original 1280×720 frames, not illustration
// strokes. Cover only their intersection with a crop; leave its CSS frame and
// all source/canvas dimensions intact. These covers also protect the raw-image
// fallback before the asynchronous ink mask is ready.
const SOURCE_HANDLES = {
  1: [[457, 149, 30, 31], [838, 495, 31, 30]],
  4: [[477, 89, 26, 26], [697, 89, 26, 26],
    [477, 289, 26, 26], [697, 289, 26, 26]],
};

function coverSourceHandles(box, {source, crop}) {
  const [cx, cy, cw, ch] = crop;
  for (const [x, y, w, h] of SOURCE_HANDLES[source] || []) {
    const left = Math.max(cx, x * 1120 / 1280);
    const top = Math.max(cy, y * 630 / 720);
    const right = Math.min(cx + cw, (x + w) * 1120 / 1280);
    const bottom = Math.min(cy + ch, (y + h) * 630 / 720);
    if (right <= left || bottom <= top) continue;
    const cover = document.createElement('div');
    cover.className = 'variation-source-handle-mask';
    cover.setAttribute('aria-hidden', 'true');
    Object.assign(cover.style, {
      left: `${(left - cx) / cw * 100}%`, top: `${(top - cy) / ch * 100}%`,
      width: `${(right - left) / cw * 100}%`, height: `${(bottom - top) / ch * 100}%`,
    });
    box.append(cover);
  }
}

function sourceImage(url) {
  if (!sources.has(url)) {
    const image = new Image();
    image.src = url;
    sources.set(url, image.decode().then(() => image));
  }
  return sources.get(url);
}

function profile(source, crop, width) {
  const [x, , cropWidth] = crop;
  if (source === 2 && x > 650) return {erosion: .5, gamma: .8, contrast: 1.6};
  if (source === 2 && x > 550) return {erosion: .25, gamma: .8, contrast: 1.6};
  if (source === 2 && x > 400) return {erosion: 0, gamma: .6, contrast: 1.6};
  if (source === 2) return {erosion: .25, gamma: .85, contrast: 1.6};
  if (source === 3) return {erosion: 0, gamma: width / cropWidth < .4 ? .6 : .85, contrast: 1.6};
  // Preserve continuous shading in decomposition and dots in the depth stream.
  return {erosion: 0, gamma: 1, contrast: source === 1 ? 1.1 : 1.25};
}

async function makeMask(url, {source, crop, width}) {
  const image = await sourceImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * SCALE);
  canvas.height = Math.round(width * crop[3] / crop[2] * SCALE);
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const sourceScaleX = image.naturalWidth / 1120;
  const sourceScaleY = image.naturalHeight / 630;
  context.drawImage(image, crop[0] * sourceScaleX, crop[1] * sourceScaleY,
    crop[2] * sourceScaleX, crop[3] * sourceScaleY,
    0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = new Float32Array(canvas.width * canvas.height);
  const {erosion, gamma, contrast} = profile(source, crop, width);
  for (let n = 0; n < alpha.length; n++) {
    const p = n * 4;
    const luminance = (pixels.data[p] * .2126 + pixels.data[p + 1] * .7152 + pixels.data[p + 2] * .0722) / 255;
    alpha[n] = Math.max(0, Math.min(1, (1 - luminance - .06) * contrast));
  }
  const radius = Math.round(erosion * SCALE);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const n = y * canvas.width + x;
      let coverage = alpha[n];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = Math.max(0, Math.min(canvas.width - 1, x + dx));
          const yy = Math.max(0, Math.min(canvas.height - 1, y + dy));
          coverage = Math.min(coverage, alpha[yy * canvas.width + xx]);
        }
      }
      pixels.data[n * 4 + 3] = Math.pow(coverage, gamma) * 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

export function applyArtworkInk(box, image, options) {
  coverSourceHandles(box, options);
  const key = JSON.stringify(options);
  if (!masks.has(key)) masks.set(key, makeMask(image.dataset.lightSrc, options));
  masks.get(key).then(mask => {
    box.style.setProperty('--art-mask', `url("${mask}")`);
    box.dataset.ink = 'ready';
  }).catch(error => {
    box.dataset.ink = 'fallback';
    console.warn('Artwork ink mask unavailable; using original poster.', error);
  });
}
