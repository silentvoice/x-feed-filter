import type { Settings } from '@/lib/settings';
import type { Verdict } from '@/lib/types';

const OVERLAY_CLASS = 'xff-overlay';

/** Blur a post while the classifier works on it. */
export function markPending(article: HTMLElement): void {
  article.classList.add('xff-pending');
}

/** Remove every change that the extension made to a post. */
export function clearTreatment(article: HTMLElement): void {
  article.classList.remove('xff-pending', 'xff-blurred', 'xff-hidden');
  article.querySelector(`:scope > .${OVERLAY_CLASS}`)?.remove();
  delete article.dataset.xffRevealed;
}

/** Show, blur, or hide a post from its verdict. A missing verdict shows the post. */
export function showVerdict(
  article: HTMLElement,
  verdict: Verdict | undefined,
  settings: Settings,
): void {
  article.classList.remove('xff-pending');
  if (!verdict?.hidden || article.dataset.xffRevealed) return;

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

  const show = document.createElement('button');
  show.type = 'button';
  show.className = 'xff-show';
  show.textContent = 'Show';
  show.addEventListener('click', (event) => {
    // Do not let X open the post.
    event.preventDefault();
    event.stopPropagation();
    article.dataset.xffRevealed = 'true';
    article.classList.remove('xff-blurred');
    overlay.remove();
  });

  overlay.append(reason, show);
  // Stop clicks on the overlay from opening the post.
  overlay.addEventListener('click', (event) => event.stopPropagation());
  article.append(overlay);
}
