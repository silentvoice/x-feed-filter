import expectedQ4 from '../scripts/d1-parity/expected-q4.json';
import expectedQ8 from '../scripts/d1-parity/expected-q8.json';
import { D1Backend, type D1Dtype } from '../src/lib/classifier/d1/d1-backend';
import type { Question } from '../src/lib/classifier/d1/prompt';
import { PRESETS } from '../src/lib/filters/presets';
import type { Post } from '../src/lib/types';

const print = (line: string) => postMessage({ line });

const POSTS: string[] = [
  'Anyone who still uses tabs is a clown and should be fired. Absolutely pathetic.',
  'My tomatoes finally came in this week. Here is the first harvest!',
  'Like and repost if you agree! Follow me for more tips every day.',
  '$PEPE2 airdrop is LIVE. Connect your wallet now, first 1000 get 10x.',
  'The Senate passed the infrastructure bill 68-32 on Tuesday after weeks of debate.',
  'We let go of 12% of the company today. Here is how we supported the people affected.',
  '10 AI tools that will replace your entire marketing team in 2027. A thread 🧵',
  'Just shipped dark mode for our app. Took longer than expected but really happy with it.',
];

const post = (text: string, i: number): Post => ({
  id: String(i),
  author: `user${i}`,
  text,
  imageAlts: [],
  imageUrls: [],
  isPromoted: false,
});

async function run(dtype: D1Dtype, device: 'webgpu' | 'wasm') {
  const results: Record<string, unknown> = { dtype, device, userAgent: navigator.userAgent };
  const backend = new D1Backend({
    dtype,
    device,
    wasmPaths: '/ort/',
    loadFile: async (path) => new Uint8Array(await (await fetch(`/model/${path}`)).arrayBuffer()),
  });

  let t = performance.now();
  await backend.load();
  results.loadMs = Math.round(performance.now() - t);
  print(`Loaded ${dtype} on ${device} in ${results.loadMs} ms`);

  // Parity with the Python reference: the same graph on ONNX Runtime CPU.
  const expected = dtype === 'q4' ? expectedQ4 : expectedQ8;
  let worst = 0;
  let flips = 0;
  for (const c of expected as { state: string; question: Question; probabilities: number[] }[]) {
    const probs = ((await backend.decide([c.state], [c.question]))[0]?.[0] ?? []) as number[];
    probs.forEach((p, i) => {
      worst = Math.max(worst, Math.abs(p - (c.probabilities[i] ?? 0)));
    });
    const argmax = (a: number[]) => a.indexOf(Math.max(...a));
    if (argmax(probs) !== argmax(c.probabilities)) flips += 1;
  }
  results.parityMaxDelta = Number(worst.toFixed(5));
  results.parityFlips = flips;
  print(
    `Parity vs Python ${dtype} CPU: max |Δ| = ${worst.toFixed(5)}, top answer changed: ${flips}`,
  );

  // Latency: posts × filters, the shape the extension uses.
  const filters = PRESETS.slice(0, 5);
  const shapes = [
    { posts: 1, filters: 1 },
    { posts: 1, filters: 5 },
    ...(device === 'webgpu' ? [{ posts: 8, filters: 5 }] : []),
  ];
  const latency: Record<string, number> = {};
  for (const shape of shapes) {
    const batch = POSTS.slice(0, shape.posts).map(post);
    const fs = filters.slice(0, shape.filters);
    await backend.classify(batch, fs); // warm-up
    const runs = device === 'webgpu' ? 5 : 2;
    t = performance.now();
    for (let i = 0; i < runs; i++) await backend.classify(batch, fs);
    const ms = (performance.now() - t) / runs;
    const key = `${shape.posts} post(s) x ${shape.filters} filter(s)`;
    latency[key] = Math.round(ms);
    print(`${key}: ${ms.toFixed(1)} ms per batch, ${(ms / shape.posts).toFixed(1)} ms per post`);
  }
  results.latencyMs = latency;

  // Scores for the sample posts, for a quick look at quality.
  const scores = await backend.classify(POSTS.map(post), filters);
  print('\nScores (P(yes)):');
  print(`${''.padEnd(48)}${filters.map((f) => f.id.slice(0, 10).padStart(11)).join('')}`);
  POSTS.forEach((text, i) => {
    const row = filters.map((f) => (scores[i]?.[f.id] ?? 0).toFixed(2).padStart(11)).join('');
    print(`${text.slice(0, 46).padEnd(48)}${row}`);
  });
  results.scores = scores;

  postMessage({ results });
}

self.addEventListener(
  'message',
  (event: MessageEvent<{ dtype: D1Dtype; device: 'webgpu' | 'wasm' }>) => {
    run(event.data.dtype, event.data.device).catch((error: unknown) => {
      postMessage({ results: { error: error instanceof Error ? error.stack : String(error) } });
    });
  },
);
