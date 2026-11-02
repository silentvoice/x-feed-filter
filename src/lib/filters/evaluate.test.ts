import { DEFAULT_SETTINGS, type Settings } from '../settings';
import type { Post } from '../types';
import { activeFilters, applyRules, thresholdFor, verdictFromScores } from './evaluate';

const post = (overrides: Partial<Post> = {}): Post => ({
  id: '1',
  author: 'alice',
  text: 'Hello world',
  imageAlts: [],
  imageUrls: [],
  isPromoted: false,
  ...overrides,
});

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

describe('thresholdFor', () => {
  it('maps strictness 0 to 0.9 and strictness 1 to 0.5', () => {
    expect(thresholdFor(0)).toBeCloseTo(0.9);
    expect(thresholdFor(1)).toBeCloseTo(0.5);
  });

  it('clamps values outside 0 to 1', () => {
    expect(thresholdFor(-1)).toBeCloseTo(0.9);
    expect(thresholdFor(2)).toBeCloseTo(0.5);
  });
});

describe('activeFilters', () => {
  it('includes enabled presets and enabled custom filters only', () => {
    const filters = activeFilters(
      settings({
        presets: { negativity: true, politics: false },
        customFilters: [
          { id: 'c1', label: 'Layoffs', question: 'Posts about layoffs', enabled: true },
          { id: 'c2', label: 'Off', question: 'Disabled', enabled: false },
        ],
      }),
    );
    expect(filters.map((f) => f.id)).toEqual(['negativity', 'c1']);
  });
});

describe('applyRules', () => {
  it('never filters allowlisted authors', () => {
    const verdict = applyRules(
      post({ author: 'Alice', text: 'buy crypto' }),
      settings({ allowlist: ['@alice'], mutedWords: ['crypto'] }),
    );
    expect(verdict?.hidden).toBe(false);
  });

  it('hides posts with a muted word, case-insensitive', () => {
    const verdict = applyRules(
      post({ text: 'Big NEWS today' }),
      settings({ mutedWords: ['news'] }),
    );
    expect(verdict).toMatchObject({ hidden: true, reasons: ['Muted: news'], source: 'rule' });
  });

  it('checks the quoted post text', () => {
    const verdict = applyRules(
      post({ quotedText: 'spoiler ahead' }),
      settings({ mutedWords: ['spoiler'] }),
    );
    expect(verdict?.hidden).toBe(true);
  });

  it('hides promoted posts only when the setting is on', () => {
    expect(applyRules(post({ isPromoted: true }), settings())).toBeNull();
    expect(applyRules(post({ isPromoted: true }), settings({ hidePromoted: true }))?.hidden).toBe(
      true,
    );
  });

  it('returns null when no rule applies', () => {
    expect(applyRules(post(), settings({ mutedWords: ['  '] }))).toBeNull();
  });
});

describe('verdictFromScores', () => {
  const filters = [
    { id: 'a', label: 'A', question: 'A?' },
    { id: 'b', label: 'B', question: 'B?' },
  ];

  it('hides when a score reaches the threshold and sorts reasons by score', () => {
    const verdict = verdictFromScores('1', { a: 0.75, b: 0.95 }, filters, 0.5);
    expect(verdict).toMatchObject({ hidden: true, reasons: ['B', 'A'], score: 0.95 });
  });

  it('shows the post when every score is below the threshold', () => {
    const verdict = verdictFromScores('1', { a: 0.6 }, filters, 0);
    expect(verdict).toMatchObject({ hidden: false, reasons: [], score: 0 });
  });
});
