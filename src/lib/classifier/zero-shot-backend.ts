import { Tokenizer } from '@huggingface/tokenizers';
import type * as Ort from 'onnxruntime-web';
import type { FilterQuestion, FilterScores, Post } from '../types';
import type { BackendStatus, ClassifierBackend } from './backend';
import { postState } from './d1/d1-backend';
import { fetchCached } from './model-cache';

export const ZERO_SHOT_REPO = 'MoritzLaurer/ModernBERT-base-zeroshot-v2.0';

export interface ZeroShotOptions {
  /** Base URL of the model files. Default: the Hugging Face repo. */
  baseUrl?: string;
  /** Maximum tokens for each (post, filter) pair. */
  maxLength?: number;
  /** Maximum pairs in one model run. */
  batchSize?: number;
  /** Load ONNX Runtime Web. Default: the WebGPU build, which also has the CPU provider. */
  loadOrt?: () => Promise<typeof Ort>;
  /** Read one model file, relative to `baseUrl`. Default: download it and keep it in Cache Storage. */
  loadFile?: (path: string, onProgress?: (progress: number) => void) => Promise<Uint8Array>;
}

/**
 * The fallback model for computers without WebGPU: ModernBERT-base trained
 * for zero-shot classification (natural language inference), 8-bit, on the
 * CPU. It reads each (post, hypothesis) pair and gives P(entailment).
 */
export class ZeroShotBackend implements ClassifierBackend {
  readonly id = 'zero-shot' as const;
  private readonly options: Required<ZeroShotOptions>;
  private session: Ort.InferenceSession | null = null;
  private ort: typeof Ort | null = null;
  private tokenizer: Tokenizer | null = null;
  private loading: Promise<void> | null = null;
  private progress = 0;
  /** ONNX Runtime Web cannot run one session twice at the same time. */
  private runQueue: Promise<unknown> = Promise.resolve();

  constructor(options: ZeroShotOptions = {}) {
    this.options = {
      baseUrl: `https://huggingface.co/${ZERO_SHOT_REPO}/resolve/main`,
      maxLength: 256,
      batchSize: 16,
      loadOrt: () => import('onnxruntime-web/webgpu'),
      loadFile: (path, onProgress) => fetchCached(`${this.options.baseUrl}/${path}`, onProgress),
      ...options,
    };
  }

  async status(): Promise<BackendStatus> {
    if (this.session) return { state: 'ready' };
    return { state: 'downloading', progress: this.progress };
  }

  load(onProgress?: (progress: number) => void): Promise<void> {
    this.loading ??= this.doLoad(onProgress).catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  private async doLoad(onProgress?: (progress: number) => void): Promise<void> {
    const { loadFile, loadOrt } = this.options;
    const [tokenizerJson, tokenizerConfig] = await Promise.all(
      ['tokenizer.json', 'tokenizer_config.json'].map(async (name) =>
        JSON.parse(new TextDecoder().decode(await loadFile(name))),
      ),
    );
    this.tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
    const model = await loadFile('onnx/model_quantized.onnx', (p) => {
      this.progress = p;
      onProgress?.(p);
    });
    const ort = await loadOrt();
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated
      ? Math.min(4, navigator.hardwareConcurrency)
      : 1;
    this.session = await ort.InferenceSession.create(model, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    this.ort = ort;
    this.progress = 1;
    onProgress?.(1);
  }

  async classify(posts: Post[], filters: FilterQuestion[]): Promise<FilterScores[]> {
    await this.load();
    const pairs = posts.flatMap((post) =>
      filters.map((filter) => [postState(post), hypothesisFor(filter)] as const),
    );
    const probs: number[] = [];
    for (let i = 0; i < pairs.length; i += this.options.batchSize) {
      probs.push(...(await this.forward(pairs.slice(i, i + this.options.batchSize))));
    }
    return posts.map((_, i) =>
      Object.fromEntries(filters.map((f, j) => [f.id, probs[i * filters.length + j] ?? 0])),
    );
  }

  private async forward(pairs: (readonly [string, string])[]): Promise<number[]> {
    const ort = this.ort as typeof Ort;
    const session = this.session as Ort.InferenceSession;
    const tokenizer = this.tokenizer as Tokenizer;
    const encoded = pairs.map(([premise, hypothesis]) => {
      const ids = tokenizer.encode(premise, { text_pair: hypothesis }).ids;
      // Keep the end: it holds the hypothesis. Truncate the premise only.
      return ids.length <= this.options.maxLength
        ? ids
        : [...ids.slice(0, this.options.maxLength - 64), ...ids.slice(-64)];
    });
    const b = encoded.length;
    const t = Math.max(...encoded.map((ids) => ids.length));
    const ids = new BigInt64Array(b * t);
    const mask = new BigInt64Array(b * t);
    encoded.forEach((row, i) => {
      row.forEach((id, j) => {
        ids[i * t + j] = BigInt(id);
        mask[i * t + j] = 1n;
      });
    });
    const feeds = {
      input_ids: new ort.Tensor('int64', ids, [b, t]),
      attention_mask: new ort.Tensor('int64', mask, [b, t]),
    };
    const run = this.runQueue.then(() => session.run(feeds));
    this.runQueue = run.catch(() => {});
    const { logits } = await run;
    const data = (logits as Ort.Tensor).data as Float32Array;
    // Labels: 0 = entailment, 1 = not entailment.
    return encoded.map((_, i) => {
      const e = data[i * 2] ?? 0;
      const n = data[i * 2 + 1] ?? 0;
      return 1 / (1 + Math.exp(n - e));
    });
  }
}

/** The NLI hypothesis for a filter. */
export function hypothesisFor(filter: FilterQuestion): string {
  if (filter.statement) return filter.statement;
  const text = filter.question.trim().replace(/[?.]$/, '');
  const described = /^Does this post match this description: (.+)$/i.exec(text);
  return `This post matches this description: ${described ? described[1] : text}.`;
}
