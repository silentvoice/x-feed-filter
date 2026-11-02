import posts from '../eval/posts.json';
import variants from '../eval/variants.json';
import type { ClassifierBackend } from '../src/lib/classifier/backend';
import { D1Backend } from '../src/lib/classifier/d1/d1-backend';
import { ZeroShotBackend } from '../src/lib/classifier/zero-shot-backend';
import type { FilterQuestion, FilterScores, Post } from '../src/lib/types';

/**
 * Score every evaluation post with every filter wording. scripts/eval.mjs
 * opens this page in Chromium and reads `window.__evalResult`.
 */
const log = document.getElementById('log') as HTMLPreElement;
const backendId = new URLSearchParams(location.search).get('backend') ?? 'd1';
const local = new URLSearchParams(location.search).get('local') === '1';
/** Optional: evaluate only these filter IDs (for example "negativity#0"). */
const only = new URLSearchParams(location.search).get('only')?.split(',');

const load = (prefix: string) => async (path: string) =>
  new Uint8Array(await (await fetch(`${prefix}/${path}`)).arrayBuffer());

const backend: ClassifierBackend =
  backendId === 'zero-shot'
    ? new ZeroShotBackend(local ? { loadFile: load('/zsmodel') } : {})
    : new D1Backend({ wasmPaths: '/ort/', ...(local ? { loadFile: load('/model') } : {}) });

const filters: FilterQuestion[] = Object.entries(
  variants as Record<string, { question: string; statement?: string }[]>,
)
  .flatMap(([id, list]) =>
    list.map((v, i) => ({
      id: `${id}#${i}`,
      label: id,
      question: v.question,
      statement: v.statement,
    })),
  )
  .filter((filter) => !only || only.includes(filter.id));

const evalPosts: Post[] = (
  posts as { id: string; author: string; text: string; quotedText?: string; imageAlts?: string[] }[]
).map((p) => ({
  id: p.id,
  author: p.author,
  text: p.text,
  quotedText: p.quotedText,
  imageAlts: p.imageAlts ?? [],
  imageUrls: [],
  isPromoted: false,
}));

async function run() {
  const started = performance.now();
  await backend.load();
  const scores: FilterScores[] = [];
  const chunk = 10;
  for (let i = 0; i < evalPosts.length; i += chunk) {
    scores.push(...(await backend.classify(evalPosts.slice(i, i + chunk), filters)));
    log.textContent = `${backendId}: ${Math.min(i + chunk, evalPosts.length)} / ${evalPosts.length} posts`;
  }
  const seconds = (performance.now() - started) / 1000;
  log.textContent += `\nDone in ${seconds.toFixed(1)} s`;
  (window as unknown as { __evalResult: unknown }).__evalResult = {
    backend: backendId,
    seconds,
    rows: evalPosts.length * filters.length,
    scores: Object.fromEntries(evalPosts.map((p, i) => [p.id, scores[i]])),
  };
}

run().catch((error: unknown) => {
  log.textContent = `Error: ${error instanceof Error ? error.stack : error}`;
  (window as unknown as { __evalResult: unknown }).__evalResult = { error: String(error) };
});
