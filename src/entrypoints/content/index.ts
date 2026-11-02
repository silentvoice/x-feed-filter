import type { ClassifyRequest, ClassifyResponse, FeedbackRequest } from '@/lib/messaging';
import type { Settings } from '@/lib/settings';
import { getSettings, watchSettings } from '@/lib/storage';
import type { Post, Verdict } from '@/lib/types';
import { extractPost } from '@/lib/x-dom/extract';
import { SELECTORS } from '@/lib/x-dom/selectors';
import { clearTreatment, markPending, showVerdict, type TreatmentHandlers } from './treatment';
import './style.css';

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 40;
/** Check posts up to one screen above and below the viewport first. */
const NEAR_VIEWPORT = '100% 0px 100% 0px';

export default defineContentScript({
  matches: ['*://x.com/*', '*://twitter.com/*'],
  runAt: 'document_idle',
  async main(ctx) {
    let settings = await getSettings();
    const queue: Post[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let scanQueued = false;
    // Posts that the user revealed stay revealed, also after a settings change.
    const revealed = new Set<string>();
    const handlers: TreatmentHandlers = {
      onReveal: (postId) => revealed.add(postId),
      isRevealed: (postId) => revealed.has(postId),
      onNotMatch: (postId, filterIds) => {
        const request: FeedbackRequest = { type: 'feedback', postId, filterIds };
        browser.runtime.sendMessage(request).catch(() => {});
      },
    };

    const flush = async () => {
      flushTimer = undefined;
      const batch = queue.splice(0, BATCH_SIZE);
      if (batch.length === 0) return;
      if (queue.length > 0) flushTimer = setTimeout(flush, 0);
      const request: ClassifyRequest = { type: 'classify', posts: batch };
      let verdicts: Verdict[] = [];
      try {
        ({ verdicts } = (await browser.runtime.sendMessage(request)) as ClassifyResponse);
      } catch (error) {
        // The extension was reloaded or the background is not available. Fail open.
        console.warn('[lull] classify request failed', error);
      }
      const byId = new Map(verdicts.map((v) => [v.postId, v]));
      for (const post of batch) {
        for (const article of articlesFor(post.id)) {
          showVerdict(article, byId.get(post.id), settings, handlers);
        }
      }
    };

    const enqueue = (post: Post) => {
      queue.push(post);
      if (flushTimer === undefined) {
        flushTimer = setTimeout(flush, queue.length >= BATCH_SIZE ? 0 : BATCH_DELAY_MS);
      }
    };

    // Posts wait here until they come near the viewport. Then they go to the queue.
    const waiting = new WeakMap<Element, Post>();
    const nearViewport = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const post = waiting.get(entry.target);
          nearViewport.unobserve(entry.target);
          waiting.delete(entry.target);
          // Skip the post if X reused the element for a different post.
          if (post && (entry.target as HTMLElement).dataset.xffId === post.id) enqueue(post);
        }
      },
      { rootMargin: NEAR_VIEWPORT },
    );
    ctx.onInvalidated(() => nearViewport.disconnect());

    const scan = () => {
      scanQueued = false;
      if (!settings.enabled) return;
      for (const article of document.querySelectorAll<HTMLElement>(SELECTORS.post)) {
        const post = extractPost(article);
        // X reuses article elements while it scrolls. Compare IDs, not just a "seen" flag.
        if (!post || article.dataset.xffId === post.id) continue;
        clearTreatment(article);
        article.dataset.xffId = post.id;
        if (settings.pendingBlur) markPending(article);
        waiting.set(article, post);
        nearViewport.unobserve(article);
        nearViewport.observe(article);
      }
    };

    const requestScan = () => {
      if (scanQueued) return;
      scanQueued = true;
      requestAnimationFrame(scan);
    };

    const rescanAll = () => {
      for (const article of document.querySelectorAll<HTMLElement>(SELECTORS.post)) {
        clearTreatment(article);
        delete article.dataset.xffId;
      }
      requestScan();
    };

    const observer = new MutationObserver(requestScan);
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => observer.disconnect());

    const unwatch = watchSettings((next: Settings) => {
      settings = next;
      rescanAll();
    });
    ctx.onInvalidated(unwatch);

    requestScan();
  },
});

function articlesFor(postId: string): NodeListOf<HTMLElement> {
  return document.querySelectorAll<HTMLElement>(`${SELECTORS.post}[data-xff-id="${postId}"]`);
}
