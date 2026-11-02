import { fetchCached } from './model-cache';

/** A response body that sends `bytes`, then fails if `failAfter` is set. */
function body(bytes: number[], failAfter?: number): ReadableStream<Uint8Array> {
  let sent = false;
  return new ReadableStream({
    pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(
          new Uint8Array(failAfter === undefined ? bytes : bytes.slice(0, failAfter)),
        );
      } else if (failAfter === undefined) controller.close();
      else controller.error(new TypeError('network error'));
    },
  });
}

describe('fetchCached', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('continues a stopped download with a range request', async () => {
    const file = [1, 2, 3, 4, 5, 6];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(body(file, 2), { headers: { 'content-length': String(file.length) } }),
      )
      .mockResolvedValueOnce(new Response(body(file.slice(2)), { status: 206 }));
    vi.stubGlobal('fetch', fetch);

    const bytes = await fetchCached('https://example.test/model-a.bin');

    expect([...bytes]).toEqual(file);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[1]).toEqual({ headers: { range: 'bytes=2-' } });
  });

  it('starts again if the server does not accept ranges', async () => {
    const file = [7, 8, 9];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(body(file, 1)))
      .mockResolvedValueOnce(new Response(body(file), { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    const bytes = await fetchCached('https://example.test/model-b.bin');

    expect([...bytes]).toEqual(file);
  });

  it('does not try again when the file does not exist', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('missing', { status: 404 }));
    vi.stubGlobal('fetch', fetch);

    await expect(fetchCached('https://example.test/missing.bin')).rejects.toThrow('404');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
