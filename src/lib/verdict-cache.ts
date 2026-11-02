import type { Verdict } from './types';

/**
 * In-memory LRU cache of verdicts. The key includes a hash of the active
 * filters, so a settings change does not return old verdicts.
 */
export class VerdictCache {
  private readonly entries = new Map<string, Verdict>();

  constructor(private readonly maxSize = 5000) {}

  get(postId: string, filterKey: string): Verdict | undefined {
    const key = `${filterKey}:${postId}`;
    const verdict = this.entries.get(key);
    if (verdict) {
      // Move the entry to the end, so it is the most recently used.
      this.entries.delete(key);
      this.entries.set(key, verdict);
    }
    return verdict;
  }

  set(postId: string, filterKey: string, verdict: Verdict): void {
    const key = `${filterKey}:${postId}`;
    this.entries.delete(key);
    this.entries.set(key, verdict);
    if (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

/** A stable key for a set of filters and a strictness value. */
export function filterKey(parts: readonly string[], strictness: number): string {
  let hash = 0;
  for (const char of `${parts.join('|')}#${strictness}`) {
    hash = (Math.imul(31, hash) + char.charCodeAt(0)) | 0;
  }
  return (hash >>> 0).toString(36);
}
