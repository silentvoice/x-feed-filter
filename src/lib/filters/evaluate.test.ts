import { DEFAULT_SETTINGS, type Settings } from '../settings';
import type { Post } from '../types';
import {
  activeFilters,
  applyRules,
  FEEDBACK_MAX,
  filterThreshold,
  thresholdFor,
  verdictFromScores,
  withFeedback,
} from './evaluate';
import { customQuestion } from './presets';

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
  it('maps strictness 0, 0.5, and 1 to 0.85, 0.55, and 0.25', () => {
    expect(thresholdFor(0)).toBeCloseTo(0.85);
    expect(thresholdFor(0.5)).toBeCloseTo(0.55);
    expect(thresholdFor(1)).toBeCloseTo(0.25);
  });

  it('clamps values outside 0 to 1', () => {
    expect(thresholdFor(-1)).toBeCloseTo(0.85);
    expect(thresholdFor(2)).toBeCloseTo(0.25);
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
    expect(filters[1]?.question).toBe(
      'Does this post match this description: Posts about layoffs?',
    );
  });
});

describe('customQuestion', () => {
  it('wraps a description in a question and a statement', () => {
    expect(customQuestion('posts about layoffs.')).toEqual({
      question: 'Does this post match this description: posts about layoffs?',
      statement: 'This post matches this description: posts about layoffs.',
    });
  });

  it('keeps a question as typed', () => {
    expect(customQuestion(' Is this about cats? ').question).toBe('Is this about cats?');
  });
});

describe('filterThreshold', () => {
  const filter = { id: 'f', label: 'F', question: 'F?', calibration: { d1: -0.3 } };

  it('applies the calibration of the model that made the scores', () => {
    expect(filterThreshold(filter, 0.5, 'd1')).toBeCloseTo(0.25);
    expect(filterThreshold(filter, 0.5, 'zero-shot')).toBeCloseTo(0.55);
  });

  it('adds feedback and stays between 0.05 and 0.97', () => {
    expect(filterThreshold(filter, 0.5, 'd1', { f: 0.1 })).toBeCloseTo(0.35);
    expect(filterThreshold(filter, 1, 'd1')).toBeCloseTo(0.05);
    expect(filterThreshold({ ...filter, calibration: { d1: 0.5 } }, 0, 'd1')).toBeCloseTo(0.97);
  });
});

describe('withFeedback', () => {
  it('raises each filter by one step, up to the maximum', () => {
    let adjust: Record<string, number> = {};
    for (let i = 0; i < 20; i++) adjust = withFeedback(adjust, ['a']);
    expect(adjust.a).toBeCloseTo(FEEDBACK_MAX);
    expect(withFeedback({}, ['a', 'b'])).toEqual({ a: 0.05, b: 0.05 });
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
    const verdict = verdictFromScores('1', { a: 0.6, b: 0.95 }, filters, 0.5);
    expect(verdict).toMatchObject({
      hidden: true,
      reasons: ['B', 'A'],
      filterIds: ['b', 'a'],
      score: 0.95,
    });
    expect(verdictFromScores('1', { a: 0.5 }, filters, 0.5).hidden).toBe(false);
  });

  it('shows the post when every score is below the threshold', () => {
    const verdict = verdictFromScores('1', { a: 0.6 }, filters, 0);
    expect(verdict).toMatchObject({ hidden: false, reasons: [], score: 0 });
  });
});
