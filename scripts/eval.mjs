/**
 * Evaluate the filters on eval/posts.json with the extension's own model code
 * (WebGPU in Chromium), and print the quality of each filter wording.
 *
 * Usage:
 *   node scripts/eval.mjs [d1|zero-shot]
 *
 * Set D1_MODEL_DIR or ZS_MODEL_DIR to read local model files. Without them,
 * the page downloads the model from Hugging Face.
 * Add --shipped to evaluate only the shipped wording of each filter (faster).
 * Writes eval/results/<backend>.json.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const postsArg = process.argv.indexOf('--posts');
/** Another posts file, for example your own labeled posts (see docs/evaluation.md). */
const postsFile = postsArg > 0 ? process.argv[postsArg + 1] : 'eval/posts.json';
const backend =
  process.argv.find((a, i) => i > 1 && !a.startsWith('--') && i !== postsArg + 1) ?? 'd1';
const shippedOnly = process.argv.includes('--shipped');
const local = backend === 'zero-shot' ? !!process.env.ZS_MODEL_DIR : !!process.env.D1_MODEL_DIR;
const THRESHOLD = 0.55; // The default strictness (0.5).

const posts = JSON.parse(await readFile(postsFile, 'utf8'));
// The page imports eval/posts.json. bench/vite.config.ts replaces it with this file.
process.env.EVAL_POSTS = resolve(postsFile);
/** The posts that have a label for this filter. A file can label only some filters. */
const labeled = (id) => posts.filter((p) => p.labels?.[id] === 0 || p.labels?.[id] === 1);
const variants = JSON.parse(await readFile('eval/variants.json', 'utf8'));

// No file watching: edits during a long run must not reload the page.
const server = await createServer({
  configFile: 'bench/vite.config.ts',
  logLevel: 'error',
  server: { hmr: false, watch: null },
});
await server.listen();
const browser = await chromium.launch({
  channel: 'chromium',
  headless: false,
  args: ['--enable-unsafe-webgpu'],
});
// The shipped filters, from the source code.
const { PRESETS, customQuestion, CUSTOM_CALIBRATION } = await server.ssrLoadModule(
  new URL('../src/lib/filters/presets.ts', import.meta.url).pathname,
);
const { thresholdFor } = await server.ssrLoadModule(
  new URL('../src/lib/filters/evaluate.ts', import.meta.url).pathname,
);
const CUSTOM = {
  layoffs: 'posts about layoffs',
  'ai-topic': 'Posts about AI, machine learning, or AI models',
};
/** The variant index of the shipped wording of each filter. */
const shippedIndex = {};
for (const [id, list] of Object.entries(variants)) {
  const preset = PRESETS.find((p) => p.id === id);
  const shippedFilter = preset ?? customQuestion(CUSTOM[id]);
  // d1 reads the question. The zero-shot model reads the statement.
  shippedIndex[id] =
    backend === 'zero-shot' && preset
      ? list.findIndex((v) => v.statement === shippedFilter.statement)
      : list.findIndex((v) => v.question === shippedFilter.question);
  if (shippedIndex[id] < 0)
    console.warn(`No variant has the shipped question for ${id}. Add it to eval/variants.json.`);
}
const only = shippedOnly
  ? `&only=${Object.entries(shippedIndex)
      .filter(([, i]) => i >= 0)
      .map(([id, i]) => `${id}%23${i}`)
      .join(',')}`
  : '';

let result;
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(`[page] ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) console.error(`[page] ${response.status()} ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      console.error(`[page] ${message.text()}`);
  });
  await page.goto(
    `http://localhost:5199/eval.html?backend=${backend}&local=${local ? 1 : 0}${only}`,
  );
  const deadline = Date.now() + 3_600_000;
  let last = '';
  while (!(await page.evaluate(() => !!window.__evalResult))) {
    if (Date.now() > deadline) throw new Error(`Timeout. Last status: ${last}`);
    const status = await page.locator('#log').textContent();
    if (status !== last) console.error(status);
    last = status;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  result = await page.evaluate(() => window.__evalResult);
} finally {
  await browser.close();
  await server.close();
}
if (result.error) throw new Error(result.error);

/** Area under the ROC curve: the chance that a random positive scores above a random negative. */
function auc(pos, neg) {
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

function f1At(scored, t) {
  let tp = 0,
    fp = 0,
    fn = 0;
  for (const { s, y } of scored) {
    if (s >= t && y) tp++;
    else if (s >= t) fp++;
    else if (y) fn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
  };
}

const report = {};
for (const [id, list] of Object.entries(variants)) {
  report[id] = list.flatMap((v, i) => {
    if (result.scores[posts[0].id][`${id}#${i}`] === undefined) return [];
    if (!labeled(id).some((p) => p.labels[id] === 1)) return [];
    const scored = labeled(id).map((p) => ({
      s: result.scores[p.id][`${id}#${i}`],
      y: p.labels[id] === 1,
    }));
    const pos = scored.filter((x) => x.y).map((x) => x.s);
    const neg = scored.filter((x) => !x.y).map((x) => x.s);
    let best = { t: 0, f1: 0 };
    for (let t = 0.05; t <= 0.951; t += 0.05) {
      const { f1 } = f1At(scored, t);
      if (f1 > best.f1) best = { t: Number(t.toFixed(2)), f1 };
    }
    return {
      variant: i,
      question: v.question,
      auc: auc(pos, neg),
      ...f1At(scored, THRESHOLD),
      best,
    };
  });
}

// The shipped configuration: preset wording and calibration at the default strictness.
const shipped = {};
for (const id of Object.keys(variants)) {
  const preset = PRESETS.find((p) => p.id === id);
  const index = shippedIndex[id];
  if (index < 0 || !labeled(id).some((p) => p.labels[id] === 1)) continue;
  const threshold = Math.min(
    0.97,
    Math.max(
      0.05,
      thresholdFor(0.5) + ((preset ? preset.calibration : CUSTOM_CALIBRATION)?.[backend] ?? 0),
    ),
  );
  const scored = labeled(id).map((p) => ({
    s: result.scores[p.id][`${id}#${index}`],
    y: p.labels[id] === 1,
  }));
  shipped[id] = {
    variant: index,
    threshold: Number(threshold.toFixed(2)),
    ...f1At(scored, threshold),
  };
}

await mkdir('eval/results', { recursive: true });
await writeFile(
  `eval/results/${backend}${postsArg > 0 ? `-${basename(postsFile, '.json')}` : ''}.json`,
  `${JSON.stringify({ backend, seconds: result.seconds, rows: result.rows, threshold: THRESHOLD, report, shipped, scores: result.scores }, null, 1)}\n`,
);

const pct = (x) => `${(x * 100).toFixed(0)}%`.padStart(5);
console.log(
  `${backend}: ${result.rows} rows in ${result.seconds.toFixed(1)} s. Threshold ${THRESHOLD}.`,
);
console.log(`${'filter'.padEnd(16)}var   AUC  prec  rec    F1 | best t  F1`);
for (const [id, rows] of Object.entries(report)) {
  for (const r of rows) {
    console.log(
      `${id.padEnd(16)} #${r.variant}  ${r.auc.toFixed(2)} ${pct(r.precision)} ${pct(r.recall)} ${pct(r.f1)} |  ${r.best.t.toFixed(2)} ${pct(r.best.f1)}`,
    );
  }
}

console.log(`\nShipped configuration (${backend}, default strictness):`);
console.log(`${'filter'.padEnd(16)}var  thr   prec  rec    F1`);
const f1s = [];
for (const [id, r] of Object.entries(shipped)) {
  f1s.push(r.f1);
  console.log(
    `${id.padEnd(16)} #${r.variant}  ${r.threshold.toFixed(2)} ${pct(r.precision)} ${pct(r.recall)} ${pct(r.f1)}`,
  );
}
console.log(`${'mean F1'.padEnd(29)}${pct(f1s.reduce((a, b) => a + b, 0) / f1s.length)}`);
