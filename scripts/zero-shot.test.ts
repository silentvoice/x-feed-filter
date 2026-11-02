// @vitest-environment node
/**
 * Check the zero-shot fallback model on the CPU.
 *
 * Run: ZS_MODEL_DIR=/path/to/ModernBERT-base-zeroshot-v2.0 npx vitest run scripts/zero-shot.test.ts
 *
 * The folder must contain tokenizer.json, tokenizer_config.json, and
 * onnx/model_quantized.onnx. The test is skipped without it.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ZeroShotBackend } from '../src/lib/classifier/zero-shot-backend';
import { PRESETS } from '../src/lib/filters/presets';
import type { Post } from '../src/lib/types';

const dir = process.env.ZS_MODEL_DIR;

const post = (id: string, text: string): Post => ({
  id,
  author: 'someone',
  text,
  imageAlts: [],
  imageUrls: [],
  isPromoted: false,
});

describe.skipIf(!dir)('zero-shot fallback model', () => {
  it('scores matching posts higher than other posts', async () => {
    const backend = new ZeroShotBackend({
      loadFile: async (path) => new Uint8Array(await readFile(join(dir as string, path))),
    });
    const filters = PRESETS.filter((p) =>
      ['negativity', 'engagement-bait', 'crypto-scams'].includes(p.id),
    );
    const posts = [
      post(
        'angry',
        'Anyone who still uses tabs is a clown and should be fired. Absolutely pathetic.',
      ),
      post('bait', 'Like and repost if you agree! Follow me for more tips every day.'),
      post('crypto', '$PEPE2 airdrop is LIVE. Connect your wallet now, first 1000 get 10x.'),
      post('garden', 'My tomatoes finally came in this week. Here is the first harvest!'),
    ];
    const started = performance.now();
    const scores = await backend.classify(posts, filters);
    const ms = performance.now() - started;
    console.table(Object.fromEntries(posts.map((p, i) => [p.id, scores[i]])));
    console.log(
      `${posts.length} posts x ${filters.length} filters: ${ms.toFixed(0)} ms (includes load)`,
    );
    expect(scores[0]?.negativity).toBeGreaterThan(scores[3]?.negativity ?? 1);
    expect(scores[1]?.['engagement-bait']).toBeGreaterThan(scores[3]?.['engagement-bait'] ?? 1);
    expect(scores[2]?.['crypto-scams']).toBeGreaterThan(scores[3]?.['crypto-scams'] ?? 1);
  }, 300_000);
});
