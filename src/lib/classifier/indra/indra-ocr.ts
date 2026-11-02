import type * as Ort from 'onnxruntime-web';
import type { ImageText } from '../image-text';
import { fetchCached } from '../model-cache';
import {
  type Box,
  cropLine,
  decodeLines,
  type Gray,
  pageToInput,
  readingOrder,
  WIDTH_MULTIPLE,
} from './image';

/** Model files: datalab-to/indra-ocr, a fixed tag. Code: Apache-2.0. Weights: modified OpenRAIL-M. */
export const INDRA_REPO = 'datalab-to/indra-ocr';
export const INDRA_REVISION = 'v1.1.0';

/** A line with a lower confidence gets no text (pipeline.py MIN_CONF). */
const MIN_CONF = 0.5;
/** pipeline.py: a second, larger detection pass for small text. */
const ADAPTIVE_MIN_H = 9;
const ADAPTIVE_TARGET_H = 12;
const ADAPTIVE_MAX_SIDE = 2048;
/** Read at most this number of lines in one image. */
const MAX_LINES = 40;
/** The most pixel columns in one recognizer batch (rec_preproc.py width_batches). */
const MAX_BATCH_AREA = 64 * 640;

interface Meta {
  det_long_side: number;
  rec_window?: number;
  vocab: string;
}

export interface IndraOptions {
  /** Base URL of the model files. Default: the Hugging Face repo at INDRA_REVISION. */
  baseUrl?: string;
  /** Load ONNX Runtime Web. */
  loadOrt?: () => Promise<typeof Ort>;
  /** Read one model file, relative to `baseUrl`. Default: download it and keep it in Cache Storage. */
  loadFile?: (path: string) => Promise<Uint8Array>;
}

export interface OcrLine {
  box: Box;
  text: string;
  conf: number;
}

/**
 * Indra OCR on the CPU: line detection and line recognition (Latin script).
 * About 5.5 MB of models. It does not use the orientation, script, layout, or
 * language models of the Python package: posts on X are upright, and the
 * extension reads English.
 */
export class IndraOcr {
  private readonly options: Required<IndraOptions>;
  private loading: Promise<void> | null = null;
  private ort: typeof Ort | null = null;
  private det: Ort.InferenceSession | null = null;
  private rec: Ort.InferenceSession | null = null;
  private longSide = 1024;
  private window = 1;
  private chars: string[] = [];
  /** ONNX Runtime Web cannot run one session twice at the same time. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: IndraOptions = {}) {
    this.options = {
      baseUrl: `https://huggingface.co/${INDRA_REPO}/resolve/${INDRA_REVISION}`,
      loadOrt: () => import('onnxruntime-web/webgpu'),
      loadFile: (path) => fetchCached(`${this.options.baseUrl}/${path}`),
      ...options,
    };
  }

  load(): Promise<void> {
    this.loading ??= this.doLoad().catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  private async doLoad(): Promise<void> {
    const { loadFile, loadOrt } = this.options;
    const [det, rec, metaBytes] = await Promise.all(
      ['det.onnx', 'rec.onnx', 'meta.json'].map((name) => loadFile(name)),
    );
    const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as Meta;
    this.longSide = meta.det_long_side;
    this.window = meta.rec_window ?? 1;
    this.chars = (JSON.parse(meta.vocab) as { chars: string[] }).chars;
    const ort = await loadOrt();
    // Extension pages are not cross-origin isolated, so WebAssembly threads are not available.
    if (!globalThis.crossOriginIsolated) ort.env.wasm.numThreads = 1;
    const options: Ort.InferenceSession.SessionOptions = {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    };
    [this.det, this.rec] = await Promise.all([
      ort.InferenceSession.create(det as Uint8Array, options),
      ort.InferenceSession.create(rec as Uint8Array, options),
    ]);
    this.ort = ort;
  }

  /** The text of an image, lines in reading order, and the mean line confidence. */
  async read(gray: Gray): Promise<ImageText> {
    const lines = await this.lines(gray);
    const read = lines.filter((line) => line.text);
    const confidence = read.length
      ? read.reduce((sum, line) => sum + line.conf, 0) / read.length
      : 0;
    return { text: read.map((line) => line.text).join('\n'), confidence };
  }

  /** All lines with their boxes, in reading order. */
  async lines(gray: Gray): Promise<OcrLine[]> {
    await this.load();
    const boxes = readingOrder(await this.detect(gray)).slice(0, MAX_LINES);
    return this.recognize(gray, boxes);
  }

  async detect(gray: Gray): Promise<Box[]> {
    await this.load();
    let { boxes, scale } = await this.detectAt(gray, this.longSide);
    if (boxes.length >= 8) {
      const heights = boxes.map((b) => b.y1 - b.y0).sort((a, b) => a - b);
      const median = median_(heights);
      if (median < ADAPTIVE_MIN_H) {
        const side =
          Math.floor(
            Math.min(ADAPTIVE_MAX_SIDE, (this.longSide * ADAPTIVE_TARGET_H) / Math.max(median, 1)) /
              32,
          ) * 32;
        if (side > this.longSide) ({ boxes, scale } = await this.detectAt(gray, side));
      }
    }
    const clip = (v: number, max: number) => Math.min(max, Math.max(0, v / scale));
    return boxes.map((b) => ({
      x0: clip(b.x0, gray.width),
      y0: clip(b.y0, gray.height),
      x1: clip(b.x1, gray.width),
      y1: clip(b.y1, gray.height),
    }));
  }

  private async detectAt(gray: Gray, longSide: number): Promise<{ boxes: Box[]; scale: number }> {
    const ort = this.ort as typeof Ort;
    const input = pageToInput(gray, longSide);
    const x = new ort.Tensor('float32', input.data, [1, 1, input.height, input.width]);
    const result = await this.run(this.det as Ort.InferenceSession, { x });
    const out = Object.values(result)[0] as Ort.Tensor;
    const [, , h = 0, w = 0] = out.dims;
    // Channels 0 to 2: core logit, distance to the top, distance to the bottom.
    const data = (out.data as Float32Array).subarray(0, 3 * h * w);
    return { boxes: decodeLines(data, h, w), scale: input.scale };
  }

  async recognize(gray: Gray, boxes: Box[]): Promise<OcrLine[]> {
    await this.load();
    const ort = this.ort as typeof Ort;
    const crops = boxes.map((box) => cropLine(gray, box, this.window));
    const out: OcrLine[] = boxes.map((box) => ({ box, text: '', conf: 0 }));
    for (const batch of widthBatches(crops.map((c) => c.width))) {
      const height = crops[0]?.height ?? 0;
      const maxWidth = Math.max(...batch.map((i) => crops[i]?.width ?? 0));
      const width = Math.ceil(maxWidth / WIDTH_MULTIPLE) * WIDTH_MULTIPLE;
      const data = new Float32Array(batch.length * height * width);
      batch.forEach((i, k) => {
        const crop = crops[i];
        if (!crop) return;
        for (let y = 0; y < height; y++) {
          data.set(
            crop.data.subarray(y * crop.width, (y + 1) * crop.width),
            (k * height + y) * width,
          );
        }
      });
      const widths = BigInt64Array.from(batch.map((i) => BigInt(crops[i]?.width ?? 0)));
      const result = await this.run(this.rec as Ort.InferenceSession, {
        x: new ort.Tensor('float32', data, [batch.length, 1, height, width]),
        widths: new ort.Tensor('int64', widths, [batch.length]),
      });
      const ids = result.ids as Ort.Tensor;
      const conf = (result.conf as Ort.Tensor).data as Float32Array;
      const lengths = (result.lengths as Ort.Tensor).data as BigInt64Array;
      const steps = ids.dims[1] ?? 0;
      batch.forEach((i, k) => {
        const n = Number(lengths[k]);
        const seq = Array.from(
          (ids.data as BigInt64Array).subarray(k * steps, k * steps + n),
          Number,
        );
        const line = ctcDecode(seq, conf.subarray(k * steps, k * steps + n), this.chars);
        const target = out[i];
        if (target && line.conf >= MIN_CONF) Object.assign(target, line);
        else if (target) target.conf = line.conf;
      });
    }
    return out;
  }

  private run(
    session: Ort.InferenceSession,
    feeds: Record<string, Ort.Tensor>,
  ): Promise<Ort.InferenceSession.ReturnType> {
    const result = this.queue.then(() => session.run(feeds));
    this.queue = result.catch(() => {});
    return result;
  }
}

/** Greedy CTC: drop blanks (0) and repeats. Confidence is the mean peak probability. */
export function ctcDecode(
  seq: number[],
  peaks: ArrayLike<number>,
  chars: string[],
): { text: string; conf: number } {
  let text = '';
  let sum = 0;
  let kept = 0;
  for (let t = 0; t < seq.length; t++) {
    const id = seq[t] ?? 0;
    if (id === 0 || (t > 0 && id === seq[t - 1])) continue;
    text += chars[id - 1] ?? '';
    sum += peaks[t] ?? 0;
    kept += 1;
  }
  return { text, conf: kept ? sum / kept : 0 };
}

/** Group lines of similar width (rec_preproc.py width_batches). */
export function widthBatches(widths: number[], maxBatch = 64, maxRatio = 1.3, minWidth = 64) {
  const order = widths.map((_, i) => i).sort((a, b) => (widths[a] ?? 0) - (widths[b] ?? 0));
  const batches: number[][] = [];
  for (const i of order) {
    const batch = batches.at(-1);
    const w = Math.max(widths[i] ?? 0, minWidth);
    const first = batch ? Math.max(widths[batch[0] ?? 0] ?? 0, minWidth) : 0;
    if (
      batch &&
      batch.length < maxBatch &&
      w <= maxRatio * first &&
      (batch.length + 1) * w <= MAX_BATCH_AREA
    ) {
      batch.push(i);
    } else batches.push([i]);
  }
  return batches;
}

function median_(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
