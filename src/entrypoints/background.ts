import type { BackendId } from '@/lib/classifier/backend';
import { activeFilters, applyRules, verdictFromScores } from '@/lib/filters/evaluate';
import {
  type ClassifyResponse,
  isClassifyRequest,
  type OffscreenClassifyRequest,
  type OffscreenClassifyResponse,
} from '@/lib/messaging';
import type { Settings } from '@/lib/settings';
import { getSettings } from '@/lib/storage';
import type { Post, Verdict } from '@/lib/types';
import { filterKey, VerdictCache } from '@/lib/verdict-cache';

const OFFSCREEN_PATH = '/offscreen.html';
const cache = new VerdictCache();

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isClassifyRequest(message)) return;
    classify(message.posts)
      .then((verdicts) => sendResponse({ verdicts } satisfies ClassifyResponse))
      .catch((error: unknown) => {
        console.error('[x-feed-filter] classify failed', error);
        // Fail open: show the posts.
        sendResponse({ verdicts: [] } satisfies ClassifyResponse);
      });
    return true;
  });
});

async function classify(posts: Post[]): Promise<Verdict[]> {
  const settings = await getSettings();
  const filters = activeFilters(settings);
  const key = filterKey(
    filters.map((f) => `${f.id}:${f.question}`),
    settings.strictness,
  );

  const verdicts: Verdict[] = [];
  const pending: Post[] = [];
  for (const post of posts) {
    const verdict = applyRules(post, settings) ?? cache.get(post.id, key);
    if (verdict) verdicts.push(verdict);
    else pending.push(post);
  }

  const backend = resolveBackend(settings);
  if (pending.length === 0 || filters.length === 0 || backend === 'rules-only') {
    return [...verdicts, ...pending.map(visible)];
  }

  await ensureOffscreenDocument();
  const request: OffscreenClassifyRequest = {
    target: 'offscreen',
    type: 'classify',
    backend,
    posts: pending,
    filters,
  };
  const { scores, error } = (await browser.runtime.sendMessage(
    request,
  )) as OffscreenClassifyResponse;
  if (error) console.warn('[x-feed-filter] model error:', error);
  pending.forEach((post, i) => {
    const verdict = verdictFromScores(post.id, scores[i] ?? {}, filters, settings.strictness);
    cache.set(post.id, key, verdict);
    verdicts.push(verdict);
  });
  return verdicts;
}

function resolveBackend(settings: Settings): BackendId {
  // TODO(M2): resolve "auto" to zero-shot when WebGPU is not available.
  return settings.backend === 'auto' ? 'd1' : settings.backend;
}

function visible(post: Post): Verdict {
  return { postId: post.id, hidden: false, reasons: [], score: 0, source: 'rule' };
}

let creating: Promise<void> | null = null;

/** Create the offscreen document that hosts the model. WebGPU is not available in service workers. */
async function ensureOffscreenDocument(): Promise<void> {
  const url = browser.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (contexts.length > 0) return;
  creating ??= browser.offscreen
    .createDocument({
      url,
      reasons: ['WORKERS'],
      justification: 'Run the on-device classification model with WebGPU.',
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}
