import { recordActivity } from '@/lib/activity';
import { saveEvalPosts } from '@/lib/eval-posts';
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
import { installedModelsItem, modelStatusItem } from '@/lib/model-status';
import type { Settings } from '@/lib/settings';
import { getSettings, saveSettings } from '@/lib/storage';
import type { Post, Verdict } from '@/lib/types';
import { filterKey, VerdictCache } from '@/lib/verdict-cache';

const OFFSCREEN_PATH = '/offscreen.html';
const cache = new VerdictCache();
/** While the model is not available, start it again at most this often. */
const AUTO_WARMUP_INTERVAL_MS = 30_000;
let lastAutoWarmup = 0;

// Storage updates read a value and write it back. Run them one at a time, so
// two batches (or two clicks) at the same time do not overwrite each other.
let storageChain: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const result = storageChain.then(task);
  storageChain = result.catch(() => {});
  return result;
}

export default defineBackground(() => {
  // The first-run page explains the model download and starts it.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install')
      void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isModelStatusMessage(message)) {
      void modelStatusItem.setValue(message.status);
      const { backend, state } = message.status;
      if (state === 'ready' && backend) {
        void serialized(async () => {
          const installed = await installedModelsItem.getValue();
          if (!installed[backend])
            await installedModelsItem.setValue({ ...installed, [backend]: true });
        });
      }
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
    [
      ...filters.map((f) => `${f.id}:${f.question}`),
      `backend:${settings.backend}`,
      `images:${settings.analyzeImages}`,
      JSON.stringify(settings.filterAdjust),
    ],
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
    for (const verdict of shown) cache.set(verdict.postId, key, verdict);
    await serialized(() => recordActivity(posts, [...fresh, ...shown]));
    return [...verdicts, ...shown];
  }

  if (!(await modelAvailable(settings))) {
    // The model must download first. Do not keep posts blurred for minutes:
    // show them, start the download, and do not cache these verdicts.
    if (Date.now() - lastAutoWarmup > AUTO_WARMUP_INTERVAL_MS) {
      lastAutoWarmup = Date.now();
      warmup().catch((error: unknown) => console.warn('[lull] warm-up failed', error));
    }
    await serialized(() => recordActivity(posts, fresh));
    return [...verdicts, ...pending.map(visible)];
  }

  await ensureOffscreenDocument();
  const request: OffscreenClassifyRequest = {
    target: 'offscreen',
    type: 'classify',
    backend,
    posts: pending,
    filters,
    readImageText: settings.analyzeImages,
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
  await serialized(() => recordActivity(posts, fresh));
  if (settings.saveForEvaluation) {
    const checked = pending.map((post, i) => ({ ...post, imageText: response.imageTexts?.[i] }));
    await serialized(() => saveEvalPosts(checked));
  }
  return verdicts;
}

/** "Not a match": raise the threshold of the filters that matched this post. */
async function feedback(postId: string, filterIds: string[]): Promise<void> {
  if (filterIds.length === 0) return;
  await serialized(async () => {
    const settings = await getSettings();
    await saveSettings({
      ...settings,
      filterAdjust: withFeedback(settings.filterAdjust, filterIds),
    });
  });
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

/**
 * True if the model is ready, or if it can start without a download. While a
 * model downloads, posts must not wait for it.
 */
async function modelAvailable(settings: Settings): Promise<boolean> {
  const [status, installed] = await Promise.all([
    modelStatusItem.getValue(),
    installedModelsItem.getValue(),
  ]);
  if (status.state === 'ready') return true;
  if (status.state === 'error') return false;
  return settings.backend === 'auto'
    ? Boolean(installed.d1 || installed['zero-shot'])
    : Boolean(installed[settings.backend]);
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
