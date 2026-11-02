import { Tokenizer } from '@huggingface/tokenizers';
import type * as Ort from 'onnxruntime-web';
import type { FilterQuestion, FilterScores, Post } from '../../types';
import type { BackendStatus, ClassifierBackend } from '../backend';
import { fetchCached } from '../model-cache';
import { encode, type PromptTokenizer, probabilities, QTYPES, type Question } from './prompt';

export const D1_REPO = 'onnx-community/d1-omni-600M-ONNX';

export type D1Dtype = 'q8' | 'q4';

const MODEL_FILE: Record<D1Dtype, string> = {
  q8: 'model_quantized',
  q4: 'model_q4',
};

export interface D1Options {
  /**
   * Quantization. "q4" is the default: on WebGPU it is about 12 times faster
   * than "q8", and the answers move by 0.05 or less on typical filters.
   */
  dtype?: D1Dtype;
  device?: 'webgpu' | 'wasm';
  /** Base URL of the model files. Default: the Hugging Face repo. */
  baseUrl?: string;
  /** URL of the folder with the ONNX Runtime `.wasm` and `.mjs` files. */
  wasmPaths?: string;
  /**
   * Maximum tokens for each row. Posts are short, so this only limits very
   * long posts. It does not change the encoding of shorter posts.
   */
  maxLength?: number;
  /** Maximum padded tokens in one model run. */
  maxBatchTokens?: number;
  /**
   * Load ONNX Runtime Web. Default: the WebGPU build. Its CPU provider cannot
   * run this model, so CPU callers pass `() => import('onnxruntime-web/wasm')`.
   */
  loadOrt?: () => Promise<typeof Ort>;
  /** Read one model file, relative to `baseUrl`. Default: download it and keep it in Cache Storage. */
  loadFile?: (path: string, onProgress?: (progress: number) => void) => Promise<Uint8Array>;
}

interface Row {
  ids: number[];
  markers: number[];
  question: Question;
}

/** Liquid AI d1-omni-600M, text path, on ONNX Runtime Web. */
export class D1Backend implements ClassifierBackend {
  readonly id = 'd1' as const;
  private readonly options: Required<D1Options>;
  private session: Ort.InferenceSession | null = null;
  private ort: typeof Ort | null = null;
  private tokenizer: PromptTokenizer | null = null;
  private temperatures: Record<string, number> = {};
  private loading: Promise<void> | null = null;
  private progress = 0;
  /** ONNX Runtime Web cannot run one session twice at the same time. A second run hangs. */
  private runQueue: Promise<unknown> = Promise.resolve();

  constructor(options: D1Options = {}) {
    this.options = {
      dtype: 'q4',
      device: 'webgpu',
      baseUrl: `https://huggingface.co/${D1_REPO}/resolve/main`,
      wasmPaths: '',
      maxLength: 512,
      maxBatchTokens: 8192,
      loadOrt: () => import('onnxruntime-web/webgpu'),
      loadFile: (path, onProgress) => fetchCached(`${this.options.baseUrl}/${path}`, onProgress),
      ...options,
    };
  }

  async status(): Promise<BackendStatus> {
    if (this.session) return { state: 'ready' };
    if (this.loading) return { state: 'downloading', progress: this.progress };
    if (this.options.device === 'webgpu' && !(await hasWebGpu())) {
      return { state: 'unavailable', reason: 'WebGPU is not available.' };
    }
    return { state: 'downloading', progress: 0 };
  }

  load(onProgress?: (progress: number) => void): Promise<void> {
    this.loading ??= this.doLoad(onProgress).catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  private async doLoad(onProgress?: (progress: number) => void): Promise<void> {
    const { dtype, device, wasmPaths, loadFile, loadOrt } = this.options;
    const file = MODEL_FILE[dtype];

    const [tokenizerJson, tokenizerConfig, config] = await Promise.all(
      ['tokenizer.json', 'tokenizer_config.json', 'config.json'].map(async (name) =>
        JSON.parse(new TextDecoder().decode(await loadFile(name))),
      ),
    );
    const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
    this.tokenizer = toPromptTokenizer(tokenizer, config.bos_token_id ?? 1);
    this.temperatures = config.temperatures ?? {};

    // The graph file is small. The weights are in the external data file.
    const report = (loaded: number) => {
      this.progress = loaded;
      onProgress?.(loaded);
    };
    const [graph, weights] = await Promise.all([
      loadFile(`onnx/${file}.onnx`),
      loadFile(`onnx/${file}.onnx_data`, report),
    ]);

    const ort = await loadOrt();
    if (wasmPaths) ort.env.wasm.wasmPaths = wasmPaths;
    // Extension pages are not cross-origin isolated, so WebAssembly threads are not available.
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated
      ? Math.min(4, navigator.hardwareConcurrency)
      : 1;
    this.session = await ort.InferenceSession.create(graph, {
      executionProviders: [device],
      graphOptimizationLevel: 'all',
      externalData: [{ path: `${file}.onnx_data`, data: weights }],
    });
    this.ort = ort;
    report(1);
  }

  async classify(posts: Post[], filters: FilterQuestion[]): Promise<FilterScores[]> {
    const questions = filters.map((f): Question => ({ type: 'noul', instructions: f.question }));
    const probs = await this.decide(posts.map(postState), questions);
    return posts.map((_, i) =>
      Object.fromEntries(filters.map((f, j) => [f.id, probs[i]?.[j]?.[0] ?? 0])),
    );
  }

  /**
   * Ask every question about every state. Returns probabilities in option
   * order for each (state, question) pair: `result[state][question]`.
   */
  async decide(states: string[], questions: Question[]): Promise<number[][][]> {
    await this.load();
    const tok = this.tokenizer as PromptTokenizer;
    const rows: Row[] = [];
    for (const state of states) {
      for (const question of questions) {
        rows.push({ ...encode(tok, state, question, this.options.maxLength), question });
      }
    }
    const flat = await this.run(rows);
    return states.map((_, i) => flat.slice(i * questions.length, (i + 1) * questions.length));
  }

  /** Run rows in batches. Rows of similar length go together to reduce padding. */
  private async run(rows: Row[]): Promise<number[][]> {
    const results: number[][] = new Array(rows.length);
    const order = rows.map((_, i) => i).sort((a, b) => lengthOf(rows, b) - lengthOf(rows, a));
    while (order.length > 0) {
      const longest = lengthOf(rows, order[0] as number);
      const size = Math.max(
        1,
        Math.min(order.length, Math.floor(this.options.maxBatchTokens / longest)),
      );
      const batch = order.splice(0, size);
      const out = await this.forward(batch.map((i) => rows[i] as Row));
      batch.forEach((rowIndex, j) => {
        results[rowIndex] = out[j] as number[];
      });
    }
    return results;
  }

  private async forward(rows: Row[]): Promise<number[][]> {
    const ort = this.ort as typeof Ort;
    const session = this.session as Ort.InferenceSession;
    const b = rows.length;
    const t = Math.max(...rows.map((r) => r.ids.length));
    const k = Math.max(...rows.map((r) => r.markers.length));

    const ids = new BigInt64Array(b * t);
    const mask = new BigInt64Array(b * t);
    const markerPos = new BigInt64Array(b * k);
    const markerMask = new BigInt64Array(b * k);
    const qtype = new BigInt64Array(b);
    rows.forEach((row, i) => {
      row.ids.forEach((id, j) => {
        ids[i * t + j] = BigInt(id);
        mask[i * t + j] = 1n;
      });
      row.markers.forEach((m, j) => {
        markerPos[i * k + j] = BigInt(m);
        markerMask[i * k + j] = 1n;
      });
      qtype[i] = BigInt(QTYPES[row.question.type]);
    });

    const feeds = {
      input_ids: new ort.Tensor('int64', ids, [b, t]),
      attention_mask: new ort.Tensor('int64', mask, [b, t]),
      prefix_len: new ort.Tensor('int64', new BigInt64Array(b), [b]),
      marker_pos: new ort.Tensor('int64', markerPos, [b, k]),
      marker_mask: new ort.Tensor('int64', markerMask, [b, k]),
      qtype: new ort.Tensor('int64', qtype, [b]),
    };
    const run = this.runQueue.then(() => session.run(feeds));
    this.runQueue = run.catch(() => {});
    const { logits } = await run;
    const data = (logits as Ort.Tensor).data as Float32Array;
    return rows.map((row, i) =>
      probabilities(row.question, data.subarray(i * k, (i + 1) * k), this.temperatures),
    );
  }
}

/** The text that the model reads for one post. */
export function postState(post: Post): string {
  const parts = [`Post by @${post.author}:`, post.text];
  if (post.quotedText) parts.push(`Quoted post: ${post.quotedText}`);
  if (post.imageAlts.length > 0) parts.push(`Images: ${post.imageAlts.join(' | ')}`);
  return parts.join('\n');
}

function toPromptTokenizer(tokenizer: Tokenizer, bosId: number): PromptTokenizer {
  return {
    encode: (text) => tokenizer.encode(text, { add_special_tokens: false }).ids,
    tokenId: (token) => {
      const id = tokenizer.token_to_id(token);
      if (id === undefined) throw new Error(`Unknown special token: ${token}`);
      return id;
    },
    bosId,
  };
}

function lengthOf(rows: Row[], i: number): number {
  return rows[i]?.ids.length ?? 0;
}

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  return Boolean(gpu && (await gpu.requestAdapter()));
}
