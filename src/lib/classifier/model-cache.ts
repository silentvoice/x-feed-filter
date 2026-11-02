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

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${url} (${response.status})`);
  }
  const total = Number(response.headers.get('content-length')) || 0;
  const bytes = await readAll(response.body, total, onProgress);

  // Keep a copy for the next start. A full disk must not stop the extension.
  await cache
    ?.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }))
    .catch((error: unknown) => console.warn('[x-feed-filter] could not cache', url, error));
  return bytes;
}

async function readAll(
  body: ReadableStream<Uint8Array>,
  total: number,
  onProgress?: (progress: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total) onProgress?.(Math.min(0.99, loaded / total));
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
