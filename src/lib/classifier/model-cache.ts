const CACHE_NAME = 'xff-models-v1';

/**
 * Fetch a model file and keep it in Cache Storage. The second call reads
 * the file from the cache and makes no network request.
 *
 * `onProgress` receives a value from 0 to 1 while the file downloads.
 */
export async function fetchCached(
  url: string,
  onProgress?: (progress: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const cache = await openCache();
  const cached = await cache?.match(url);
  if (cached) {
    onProgress?.(1);
    return new Uint8Array(await cached.arrayBuffer());
  }

  const bytes = await download(url, onProgress);

  // Keep a copy for the next start. A full disk must not stop the extension.
  await cache
    ?.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }))
    .catch((error: unknown) => console.warn('[lull] could not cache', url, error));
  return bytes;
}

/** Number of attempts for one file. Large downloads can stop on a bad connection. */
const ATTEMPTS = 4;

/**
 * Download a file. If the connection stops, try again and continue from the
 * last byte (HTTP range request). If the server does not accept ranges,
 * start again from the first byte.
 */
async function download(
  url: string,
  onProgress?: (progress: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  let total = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, loaded ? { headers: { range: `bytes=${loaded}-` } } : {});
      if (!response.ok || !response.body) {
        const error = new Error(`Download failed: ${url} (${response.status})`);
        // A missing file does not appear on the next attempt.
        if (response.status === 404 || response.status === 403) attempt = ATTEMPTS;
        throw error;
      }
      if (loaded && response.status !== 206) {
        chunks.length = 0;
        loaded = 0;
      }
      if (!loaded) total = Number(response.headers.get('content-length')) || 0;
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total) onProgress?.(Math.min(0.99, loaded / total));
      }
      break;
    } catch (error) {
      if (attempt >= ATTEMPTS) throw error;
      console.warn(`[lull] download stopped, attempt ${attempt} of ${ATTEMPTS}:`, url, error);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function openCache(): Promise<Cache | null> {
  try {
    return 'caches' in globalThis ? await caches.open(CACHE_NAME) : null;
  } catch {
    return null;
  }
}
