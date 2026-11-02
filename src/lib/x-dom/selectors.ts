/**
 * All X (x.com) DOM selectors live here. When X changes its markup, update
 * this file only. Prefer `data-testid` attributes: they change less often
 * than class names.
 */
export const SELECTORS = {
  post: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  permalink: 'a[href*="/status/"]:has(time)',
  image: '[data-testid="tweetPhoto"] img',
  /** Box of a quoted post inside a post. */
  quote: 'div[role="link"]',
  /** Container of one timeline row. X virtualizes these rows. */
  cell: '[data-testid="cellInnerDiv"]',
} as const;
