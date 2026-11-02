import { type BackendId, type ClassifierBackend, RulesOnlyBackend } from '@/lib/classifier/backend';
import { D1Backend } from '@/lib/classifier/d1/d1-backend';
import { isOffscreenRequest, type OffscreenClassifyResponse } from '@/lib/messaging';

const backends = new Map<BackendId, ClassifierBackend>();

function getBackend(id: BackendId): ClassifierBackend {
  let backend = backends.get(id);
  if (!backend) {
    // TODO(M2): add the zero-shot fallback backend (ModernBERT, Transformers.js).
    // The ONNX Runtime `.wasm` file ships in the extension package. Manifest V3 does not permit remote code.
    backend = id === 'd1' ? new D1Backend() : new RulesOnlyBackend();
    backends.set(id, backend);
  }
  return backend;
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isOffscreenRequest(message)) return;
  const backend = getBackend(message.backend);
  backend
    .load()
    .then(() => backend.classify(message.posts, message.filters))
    .then((scores) => sendResponse({ scores } satisfies OffscreenClassifyResponse))
    .catch((error: unknown) => {
      console.error('[x-feed-filter] model error', error);
      sendResponse({ scores: [] } satisfies OffscreenClassifyResponse);
    });
  return true;
});
