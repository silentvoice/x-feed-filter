import type { Settings } from '../settings';
import type { FilterQuestion, FilterScores, Post, Verdict } from '../types';
import { PRESETS } from './presets';

/** The filters that the model must check, from the current settings. */
export function activeFilters(settings: Settings): FilterQuestion[] {
  const presets = PRESETS.filter((p) => settings.presets[p.id]);
  const custom = settings.customFilters.filter((f) => f.enabled);
  return [...presets, ...custom].map(({ id, label, question }) => ({ id, label, question }));
}

/**
 * Map strictness to a probability threshold.
 * Strictness 0 hides at P >= 0.9. Strictness 1 hides at P >= 0.5.
 */
export function thresholdFor(strictness: number): number {
  return 0.9 - 0.4 * Math.min(1, Math.max(0, strictness));
}

/** Check the rules that do not need the model. Returns a verdict, or null if no rule applies. */
export function applyRules(post: Post, settings: Settings): Verdict | null {
  const allowed = settings.allowlist.some((h) => normalizeHandle(h) === post.author.toLowerCase());
  if (allowed) {
    return { postId: post.id, hidden: false, reasons: [], score: 0, source: 'rule' };
  }
  if (settings.hidePromoted && post.isPromoted) {
    return { postId: post.id, hidden: true, reasons: ['Promoted'], score: 1, source: 'rule' };
  }
  const haystack = `${post.text}\n${post.quotedText ?? ''}`.toLowerCase();
  const word = settings.mutedWords.find(
    (w) => w.trim() && haystack.includes(w.trim().toLowerCase()),
  );
  if (word) {
    return { postId: post.id, hidden: true, reasons: [`Muted: ${word}`], score: 1, source: 'rule' };
  }
  return null;
}

/** Turn model scores into a verdict. */
export function verdictFromScores(
  postId: string,
  scores: FilterScores,
  filters: FilterQuestion[],
  strictness: number,
): Verdict {
  const threshold = thresholdFor(strictness);
  const matched = filters
    .map((f) => ({ label: f.label, score: scores[f.id] ?? 0 }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
  return {
    postId,
    hidden: matched.length > 0,
    reasons: matched.map((m) => m.label),
    score: matched[0]?.score ?? 0,
    source: 'model',
  };
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}
