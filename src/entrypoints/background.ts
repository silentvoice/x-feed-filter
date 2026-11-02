import { recordActivity } from '@/lib/activity';
import { activeFilters, applyRules, verdictFromScores, withFeedback } from '@/lib/filters/evaluate';
import {
  type ClassifyResponse,
  isClassifyRequest,
  isFeedbackRequest,
  isModelStatusMessage,
  isWarmupRequest,
  type OffscreenClassifyRequest,
  type OffscreenClassifyResponse,
  type OffscreenWarmupRequest,
} from '@/lib/messaging';
import { modelStatusItem } from '@/lib/model-status';
import { getSettings, saveSettings } from '@/lib/storage';
import type { Post, Verdict } from '@/lib/types';
import { filterKey, VerdictCache } from '@/lib/verdict-cache';

const OFFSCREEN_PATH = '/offscreen.html';
const cache = new VerdictCache();

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isModelStatusMessage(message)) {
      void modelStatusItem.setValue(message.status);
      return;
    }
    if (isFeedbackRequest(message)) {
      feedback(message.postId, message.filterIds).catch((error: unknown) =>
        console.warn('[lull] feedback failed', error),
      );
      return;
    }
    if (isWarmupRequest(message)) {
      warmup().catch((error: unknown) => console.warn('[lull] warm-up failed', error));
      return;
    }
    if (!isClassifyRequest(message)) return;
    classify(message.posts)
      .then((verdicts) => sendResponse({ verdicts } satisfies ClassifyResponse))
      .catch((error: unknown) => {
        console.error('[lull] classify failed', error);
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
    [...filters.map((f) => `${f.id}:${f.question}`), JSON.stringify(settings.filterAdjust)],
    settings.strictness,
  );

  const verdicts: Verdict[] = [];
  const fresh: Verdict[] = [];
  const pending: Post[] = [];
  for (const post of posts) {
    const cached = cache.get(post.id, key);
    if (cached) {
      verdicts.push(cached);
      continue;
    }
    const ruled = applyRules(post, settings);
    if (ruled) {
      cache.set(post.id, key, ruled);
      verdicts.push(ruled);
      fresh.push(ruled);
    } else pending.push(post);
  }

  const backend = settings.backend;
  if (pending.length === 0 || filters.length === 0 || backend === 'rules-only') {
    const shown = pending.map(visible);
    await recordActivity(posts, [...fresh, ...shown]);
    return [...verdicts, ...shown];
  }

  await ensureOffscreenDocument();
  const request: OffscreenClassifyRequest = {
    target: 'offscreen',
    type: 'classify',
    backend,
    posts: pending,
    filters,
  };
  const response = (await browser.runtime.sendMessage(request)) as OffscreenClassifyResponse;
  if (response.error) {
    console.warn('[lull] model error:', response.error);
    // Fail open, and do not cache: the next view tries again.
    return [...verdicts, ...pending.map(visible)];
  }
  pending.forEach((post, i) => {
    const verdict = verdictFromScores(
      post.id,
      response.scores[i] ?? {},
      filters,
      settings.strictness,
      response.backend ?? 'd1',
      settings.filterAdjust,
    );
    cache.set(post.id, key, verdict);
    verdicts.push(verdict);
    fresh.push(verdict);
  });
  await recordActivity(posts, fresh);
  return verdicts;
}

/** "Not a match": raise the threshold of the filters that matched this post. */
async function feedback(postId: string, filterIds: string[]): Promise<void> {
  if (filterIds.length === 0) return;
  const settings = await getSettings();
  await saveSettings({ ...settings, filterAdjust: withFeedback(settings.filterAdjust, filterIds) });
  console.info('[lull] feedback for post', postId, filterIds);
}

/** Load the model in the background, so the first posts do not wait for it. */
async function warmup(): Promise<void> {
  const settings = await getSettings();
  if (!settings.enabled || settings.backend === 'rules-only') return;
  await ensureOffscreenDocument();
  const request: OffscreenWarmupRequest = {
    target: 'offscreen',
    type: 'warmup',
    backend: settings.backend,
  };
  await browser.runtime.sendMessage(request);
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
