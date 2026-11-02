import type { Verdict } from './types';
import { filterKey, VerdictCache } from './verdict-cache';

const verdict = (postId: string): Verdict => ({
  postId,
  hidden: false,
  reasons: [],
  score: 0,
  source: 'model',
});

describe('VerdictCache', () => {
  it('separates entries by filter key', () => {
    const cache = new VerdictCache();
    cache.set('1', 'k1', verdict('1'));
    expect(cache.get('1', 'k1')).toBeDefined();
    expect(cache.get('1', 'k2')).toBeUndefined();
  });

  it('removes the least recently used entry when full', () => {
    const cache = new VerdictCache(2);
    cache.set('1', 'k', verdict('1'));
    cache.set('2', 'k', verdict('2'));
    cache.get('1', 'k');
    cache.set('3', 'k', verdict('3'));
    expect(cache.get('2', 'k')).toBeUndefined();
    expect(cache.get('1', 'k')).toBeDefined();
  });
});

describe('filterKey', () => {
  it('changes when filters or strictness change', () => {
    const base = filterKey(['a', 'b'], 0.5);
    expect(filterKey(['a', 'b'], 0.5)).toBe(base);
    expect(filterKey(['a'], 0.5)).not.toBe(base);
    expect(filterKey(['a', 'b'], 0.6)).not.toBe(base);
  });
});
