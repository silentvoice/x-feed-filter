import type { Post } from '../types';
import { SELECTORS } from './selectors';

const STATUS_PATH = /^\/([^/]+)\/status\/(\d+)/;

/**
 * Read one post from its `<article>` element. Returns null if the element
 * does not look like a complete post (for example, while X still renders it).
 */
export function extractPost(article: Element): Post | null {
  const permalink = article.querySelector<HTMLAnchorElement>(SELECTORS.permalink);
  const match = permalink
    ? STATUS_PATH.exec(new URL(permalink.href, location.href).pathname)
    : null;
  if (!match) return null;
  const [, author = '', id = ''] = match;

  // A quoted post is a nested box with its own text element. Use the box, not
  // the order: a quote post can have no text of its own.
  const texts = [...article.querySelectorAll(SELECTORS.text)];
  const own = texts.find((el) => !el.closest(SELECTORS.quote));
  const quoted = texts.find((el) => el.closest(SELECTORS.quote));
  const images = [...article.querySelectorAll<HTMLImageElement>(SELECTORS.image)];

  return {
    id,
    author,
    text: own?.textContent?.trim() ?? '',
    quotedText: quoted?.textContent?.trim() || undefined,
    imageAlts: images.map((img) => img.alt).filter((alt) => alt && alt !== 'Image'),
    imageUrls: images.map((img) => img.src),
    isPromoted: isPromoted(article),
  };
}

function isPromoted(article: Element): boolean {
  // X labels ads with a small "Ad" or "Promoted" text span next to the menu.
  for (const span of article.querySelectorAll('span')) {
    const label = span.textContent?.trim();
    if ((label === 'Ad' || label === 'Promoted') && span.children.length === 0) return true;
  }
  return false;
}
