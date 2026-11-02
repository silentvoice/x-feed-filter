import type { Settings } from '@/lib/settings';
import type { Verdict } from '@/lib/types';

const OVERLAY_CLASS = 'xff-overlay';

export interface TreatmentHandlers {
  /** The user clicked "Show". */
  onReveal(postId: string): void;
  /** The user clicked "Not a match". */
  onNotMatch(postId: string, filterIds: string[]): void;
  /** True if the user revealed this post before. */
  isRevealed(postId: string): boolean;
}

/** Blur a post while the classifier works on it. */
export function markPending(article: HTMLElement): void {
  article.classList.add('xff-pending');
}

/** Remove every change that the extension made to a post. */
export function clearTreatment(article: HTMLElement): void {
  article.classList.remove('xff-pending', 'xff-blurred', 'xff-hidden');
  article.querySelector(`:scope > .${OVERLAY_CLASS}`)?.remove();
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.addEventListener('click', (event) => {
    // Do not let X open the post.
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return el;
}

/** Show, blur, or hide a post from its verdict. A missing verdict shows the post. */
export function showVerdict(
  article: HTMLElement,
  verdict: Verdict | undefined,
  settings: Settings,
  handlers: TreatmentHandlers,
): void {
  article.classList.remove('xff-pending');
  if (!verdict?.hidden || handlers.isRevealed(verdict.postId)) return;

  if (settings.action === 'hide') {
    article.classList.add('xff-hidden');
    return;
  }

  article.classList.add('xff-blurred');
  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  overlay.setAttribute('role', 'group');
  overlay.setAttribute('aria-label', 'Filtered post');

  const reason = document.createElement('span');
  reason.className = 'xff-reason';
  reason.textContent = `Filtered: ${verdict.reasons.join(', ')}`;

  const reveal = () => {
    article.classList.remove('xff-blurred');
    overlay.remove();
  };
  const show = button('Show', 'xff-show', () => {
    handlers.onReveal(verdict.postId);
    reveal();
  });
  overlay.append(reason, show);

  // Rules (muted words, promoted posts) are exact. Feedback applies to model verdicts only.
  if (verdict.source === 'model' && verdict.filterIds?.length) {
    const notMatch = button('Not a match', 'xff-not-match', () => {
      handlers.onReveal(verdict.postId);
      handlers.onNotMatch(verdict.postId, verdict.filterIds ?? []);
      reveal();
    });
    notMatch.title = 'Show this post and make these filters less strict';
    overlay.append(notMatch);
  }

  // Stop clicks on the overlay from opening the post.
  overlay.addEventListener('click', (event) => event.stopPropagation());
  article.append(overlay);
}
