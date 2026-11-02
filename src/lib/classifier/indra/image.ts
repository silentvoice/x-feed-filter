/**
 * Image steps of Indra OCR (datalab-to/indra), ported from Python and OpenCV
 * to plain TypeScript: grayscale, resize, line detection decode, and line crop.
 * The names and the constants follow `det_post.py` and `rec_preproc.py`.
 */

/** A grayscale image: one byte for each pixel, row by row. */
export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

/** A line box in image pixels. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// det_post.py
const CORE_X_SHRINK = 0.15;
const OUT_STRIDE = 2;
const INPUT_MULTIPLE = 32;
// rec_preproc.py
export const LINE_HEIGHT = 32;
const PAD_Y = 0.2;
export const PAD_X = 0.3;
export const WIDTH_MULTIPLE = 8;
const MAX_LINE_WIDTH = 4096;

/** RGBA to grayscale, as OpenCV `COLOR_BGR2GRAY` (fixed point). Transparent pixels are white. */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const a = rgba[i * 4 + 3] ?? 255;
    const blend = (v: number) => (v * a + 255 * (255 - a)) / 255;
    const r = blend(rgba[i * 4] ?? 0);
    const g = blend(rgba[i * 4 + 1] ?? 0);
    const b = blend(rgba[i * 4 + 2] ?? 0);
    data[i] = (r * 4899 + g * 9617 + b * 1868 + 8192) >> 14;
  }
  return { width, height, data };
}

/**
 * Resize like OpenCV: area averaging to make an image smaller (`INTER_AREA`),
 * bilinear to make it larger (`INTER_LINEAR`). The two passes are separable.
 */
export function resize(src: Gray, width: number, height: number, area: boolean): Gray {
  if (width === src.width && height === src.height) return src;
  const xs = weights(src.width, width, area);
  const ys = weights(src.height, height, area);
  // Horizontal pass into floats, then vertical pass with rounding to bytes.
  const tmp = new Float32Array(width * src.height);
  for (let y = 0; y < src.height; y++) {
    const row = y * src.width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (const [i, w] of xs[x] ?? []) sum += (src.data[row + i] ?? 0) * w;
      tmp[y * width + x] = sum;
    }
  }
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (const [i, w] of ys[y] ?? []) sum += (tmp[i * width + x] ?? 0) * w;
      data[y * width + x] = Math.min(255, Math.max(0, Math.round(sum)));
    }
  }
  return { width, height, data };
}

/** For each output pixel: the source pixels and their weights. */
function weights(srcN: number, dstN: number, area: boolean): [number, number][][] {
  const scale = srcN / dstN;
  const out: [number, number][][] = [];
  for (let d = 0; d < dstN; d++) {
    if (area && scale > 1) {
      const start = d * scale;
      const end = Math.min(srcN, start + scale);
      const list: [number, number][] = [];
      for (let s = Math.floor(start); s < Math.ceil(end); s++) {
        const w = Math.min(end, s + 1) - Math.max(start, s);
        if (w > 1e-9) list.push([Math.min(s, srcN - 1), w / scale]);
      }
      out.push(list);
    } else {
      const s = (d + 0.5) * scale - 0.5;
      const i0 = Math.floor(s);
      const f = s - i0;
      const a = Math.min(srcN - 1, Math.max(0, i0));
      const b = Math.min(srcN - 1, Math.max(0, i0 + 1));
      out.push(
        a === b
          ? [[a, 1]]
          : [
              [a, 1 - f],
              [b, f],
            ],
      );
    }
  }
  return out;
}

/**
 * Detector input: resize the page so its long side is `longSide`, then pad to a
 * multiple of 32. The result is an ink map (0 = paper, 1 = ink).
 */
export function pageToInput(
  gray: Gray,
  longSide: number,
): { data: Float32Array; width: number; height: number; scale: number } {
  const scale = longSide / Math.max(gray.width, gray.height);
  const nw = Math.max(1, Math.round(gray.width * scale));
  const nh = Math.max(1, Math.round(gray.height * scale));
  const resized = resize(gray, nw, nh, scale < 1);
  const width = Math.ceil(nw / INPUT_MULTIPLE) * INPUT_MULTIPLE;
  const height = Math.ceil(nh / INPUT_MULTIPLE) * INPUT_MULTIPLE;
  const data = new Float32Array(width * height);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      data[y * width + x] = 1 - (resized.data[y * nw + x] ?? 255) / 255;
    }
  }
  return { data, width, height, scale };
}

/**
 * Decode the detector output [3, h, w] (core logit, distance to the top, distance
 * to the bottom) into line boxes in detector input pixels.
 */
export function decodeLines(out: Float32Array, h: number, w: number, thresh = 0.5): Box[] {
  const n = h * w;
  const labels = new Int32Array(n);
  const prob = (i: number) => 1 / (1 + Math.exp(-(out[i] ?? 0)));
  let next = 0;
  const boxes: Box[] = [];
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (labels[start] !== 0 || prob(start) <= thresh) continue;
    // One connected component (4-connectivity).
    next += 1;
    labels[start] = next;
    stack.push(start);
    let count = 0;
    let top = 0;
    let bottom = 0;
    let left = w;
    let right = -1;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      const row = Math.floor(i / w);
      const col = i - row * w;
      const ys = (row + 0.5) * OUT_STRIDE;
      count += 1;
      top += ys - (out[n + i] ?? 0);
      bottom += ys + (out[2 * n + i] ?? 0);
      left = Math.min(left, col);
      right = Math.max(right, col);
      for (const j of [i - w, i + w, col > 0 ? i - 1 : -1, col < w - 1 ? i + 1 : -1]) {
        if (j >= 0 && j < n && labels[j] === 0 && prob(j) > thresh) {
          labels[j] = next;
          stack.push(j);
        }
      }
    }
    if (count < 2) continue;
    const y0 = top / count;
    const y1 = bottom / count;
    const lh = Math.max(1, y1 - y0);
    const ex = Math.min(CORE_X_SHRINK * lh, 0.5 * lh);
    boxes.push({ x0: left * OUT_STRIDE - ex, y0, x1: (right + 1) * OUT_STRIDE + ex, y1 });
  }
  return boxes;
}

/** Percentiles (linear, as NumPy) of the bytes in a box, from a histogram. */
function percentiles(values: Uint8Array, qs: number[]): number[] {
  const hist = new Array<number>(256).fill(0);
  for (const v of values) hist[v] = (hist[v] ?? 0) + 1;
  const cum: number[] = [];
  let total = 0;
  for (const c of hist) {
    total += c;
    cum.push(total);
  }
  // The smallest value whose cumulative count is more than `rank`.
  const at = (rank: number) => cum.findIndex((c) => c > rank);
  return qs.map((q) => {
    const x = q * (values.length - 1);
    const i = Math.floor(x);
    const g = x - i;
    const lo = at(i);
    const hi = at(Math.min(i + 1, values.length - 1));
    const d = hi - lo;
    return g >= 0.5 ? hi - d * (1 - g) : lo + d * g;
  });
}

/** Light text on a dark ground: the recognizer must read the line inverted. */
export function isDarkLine(gray: Gray, box: Box): boolean {
  const x0 = Math.max(0, Math.trunc(box.x0));
  const y0 = Math.max(0, Math.trunc(box.y0));
  const x1 = Math.min(gray.width, Math.trunc(box.x1) + 1);
  const y1 = Math.min(gray.height, Math.trunc(box.y1) + 1);
  if (x1 <= x0 || y1 <= y0) return false;
  const values = new Uint8Array((x1 - x0) * (y1 - y0));
  let k = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) values[k++] = gray.data[y * gray.width + x] ?? 255;
  }
  const [lo = 0, med = 0, hi = 0] = percentiles(values, [0.02, 0.5, 0.98]);
  return hi - med > 2 * (med - lo) + 8;
}

/**
 * Recognizer input for one line: expand the box, crop it (paper color outside
 * the page), and resize it to `window × 32` pixels high. A tall window adds the
 * page above and below the line. Returns an ink map (0 = paper, 1 = ink).
 */
export function cropLine(
  gray: Gray,
  box: Box,
  window: number,
): { data: Float32Array; width: number; height: number } {
  const padY = (window * (1 + 2 * PAD_Y) - 1) / 2;
  const height = LINE_HEIGHT * window;
  const h = Math.max(1, box.y1 - box.y0);
  const ix0 = Math.floor(box.x0 - PAD_X * h);
  const iy0 = Math.floor(box.y0 - padY * h);
  const ix1 = Math.ceil(box.x1 + PAD_X * h);
  const iy1 = Math.ceil(box.y1 + padY * h);
  const cw = Math.max(1, ix1 - ix0);
  const ch = Math.max(1, iy1 - iy0);
  const dark = isDarkLine(gray, box);
  const crop = new Uint8Array(cw * ch).fill(dark ? 0 : 255);
  for (let y = Math.max(0, iy0); y < Math.min(gray.height, iy1); y++) {
    for (let x = Math.max(0, ix0); x < Math.min(gray.width, ix1); x++) {
      crop[(y - iy0) * cw + (x - ix0)] = gray.data[y * gray.width + x] ?? 255;
    }
  }
  const width = Math.max(WIDTH_MULTIPLE, Math.min(MAX_LINE_WIDTH, Math.round((cw * height) / ch)));
  const resized = resize({ width: cw, height: ch, data: crop }, width, height, ch > height);
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const v = (resized.data[i] ?? 0) / 255;
    data[i] = dark ? v : 1 - v;
  }
  return { data, width, height };
}

/** Reading order for simple images: top to bottom, then left to right in one row. */
export function readingOrder(boxes: Box[]): Box[] {
  const sorted = [...boxes].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const rows: Box[][] = [];
  for (const box of sorted) {
    const row = rows.at(-1);
    const last = row?.[0];
    const overlap = last ? Math.min(last.y1, box.y1) - Math.max(last.y0, box.y0) : 0;
    if (row && last && overlap > 0.5 * Math.min(last.y1 - last.y0, box.y1 - box.y0)) {
      row.push(box);
    } else rows.push([box]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x0 - b.x0));
}
