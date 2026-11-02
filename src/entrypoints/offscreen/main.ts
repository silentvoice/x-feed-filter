import {
  type BackendChoice,
  type BackendId,
  type ClassifierBackend,
  RulesOnlyBackend,
} from '@/lib/classifier/backend';
import { D1Backend } from '@/lib/classifier/d1/d1-backend';
import { ZeroShotBackend } from '@/lib/classifier/zero-shot-backend';
import {
  isOffscreenRequest,
  type ModelStatusMessage,
  type OffscreenClassifyResponse,
} from '@/lib/messaging';
import type { ModelStatus } from '@/lib/model-status';

const backends = new Map<BackendId, ClassifierBackend>();
let autoChoice: Promise<BackendId> | null = null;
/** After a d1 failure in "auto" mode, try d1 again after this time. The error can be temporary. */
const D1_RETRY_MS = 10 * 60 * 1000;
/** The last status that this document reported for each backend. */
const reported = new Map<BackendId, ModelStatus['state']>();

function create(id: BackendId): ClassifierBackend {
  // The ONNX Runtime `.wasm` file ships in the extension package. Manifest V3 does not permit remote code.
  if (id === 'd1') return new D1Backend();
  if (id === 'zero-shot') return new ZeroShotBackend();
  return new RulesOnlyBackend();
}

function report(status: ModelStatus): void {
  browser.runtime
    .sendMessage({ type: 'model-status', status } satisfies ModelStatusMessage)
    .catch(() => {});
}

/** Load a backend once and report its progress. */
async function loaded(id: BackendId): Promise<ClassifierBackend> {
  let backend = backends.get(id);
  if (!backend) {
    backend = create(id);
    backends.set(id, backend);
  }
  let last = -1;
  await backend.load((progress) => {
    // Report each whole percent, not each chunk.
    const pct = Math.floor(progress * 100);
    if (pct === last) return;
    last = pct;
    reported.set(id, 'loading');
    report({ state: 'loading', backend: id, progress });
  });
  if (reported.get(id) !== 'ready') report({ state: 'ready', backend: id, progress: 1 });
  reported.set(id, 'ready');
  return backend;
}

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  try {
    return Boolean(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

/** "auto": d1 with WebGPU. Without WebGPU, or if d1 fails to load, the zero-shot model. */
async function resolve(choice: BackendChoice): Promise<ClassifierBackend> {
  if (choice !== 'auto') return loaded(choice);
  autoChoice ??= (async (): Promise<BackendId> => {
    if (!(await hasWebGpu())) return 'zero-shot';
    try {
      await loaded('d1');
      return 'd1';
    } catch (error) {
      console.warn('[lull] d1 failed, using the zero-shot model', error);
      setTimeout(() => {
        autoChoice = null;
      }, D1_RETRY_MS);
      return 'zero-shot';
    }
  })();
  return loaded(await autoChoice);
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isOffscreenRequest(message)) return;
  const work = resolve(message.backend)
    .catch((error: unknown) => {
      // Only a load failure is a model error. A failed batch does not change the status.
      report({ state: 'error', progress: 0, message: errorText(error) });
      throw error;
    })
    .then(async (backend) => ({
      backend: backend.id,
      scores:
        message.type === 'classify' ? await backend.classify(message.posts, message.filters) : [],
    }));
  work
    .then(({ backend, scores }) =>
      sendResponse({ scores, backend } satisfies OffscreenClassifyResponse),
    )
    .catch((error: unknown) => {
      console.error('[lull] model error', error);
      sendResponse({ scores: [], error: errorText(error) } satisfies OffscreenClassifyResponse);
    });
  return true;
});

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
