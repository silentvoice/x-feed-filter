import type { BackendId } from '../classifier/backend';
import type { Settings } from '../settings';
import type { FilterQuestion, FilterScores, Post, Verdict } from '../types';
import { CUSTOM_CALIBRATION, customQuestion, PRESETS } from './presets';

/** Each "Not a match" click raises that filter's threshold by this amount. */
export const FEEDBACK_STEP = 0.05;
/** The largest total change from feedback. */
export const FEEDBACK_MAX = 0.3;

/** The filters that the model must check, from the current settings. */
export function activeFilters(settings: Settings): FilterQuestion[] {
  const presets: FilterQuestion[] = PRESETS.filter((p) => settings.presets[p.id]).map(
    ({ id, label, question, statement, calibration }) => ({
      id,
      label,
      question,
      statement,
      calibration,
    }),
  );
  const custom: FilterQuestion[] = settings.customFilters
    .filter((f) => f.enabled)
    .map((f) => ({
      id: f.id,
      label: f.label,
      ...customQuestion(f.question),
      calibration: CUSTOM_CALIBRATION,
    }));
  return [...presets, ...custom];
}

/**
 * Map strictness to a probability threshold.
 * Strictness 0 hides at P >= 0.85, the default 0.5 at P >= 0.55, and 1 at P >= 0.25.
 *
 * On real posts, d1 gives off-topic posts about 0 to 0.1 and on-topic posts
 * 0.25 to 0.98. Provisional: tune on the labeled evaluation set (milestone M3).
 */
export function thresholdFor(strictness: number): number {
  return 0.85 - 0.6 * Math.min(1, Math.max(0, strictness));
}

/** The threshold for one filter: strictness, model calibration, and user feedback. */
export function filterThreshold(
  filter: FilterQuestion,
  strictness: number,
  backend: BackendId,
  adjust: Record<string, number> = {},
): number {
  const t =
    thresholdFor(strictness) + (filter.calibration?.[backend] ?? 0) + (adjust[filter.id] ?? 0);
  return Math.min(0.97, Math.max(0.05, t));
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
  backend: BackendId = 'd1',
  adjust: Record<string, number> = {},
): Verdict {
  const matched = filters
    .map((f) => ({
      id: f.id,
      label: f.label,
      score: scores[f.id] ?? 0,
      threshold: filterThreshold(f, strictness, backend, adjust),
    }))
    .filter((m) => m.score >= m.threshold)
    .sort((a, b) => b.score - a.score);
  return {
    postId,
    hidden: matched.length > 0,
    reasons: matched.map((m) => m.label),
    filterIds: matched.map((m) => m.id),
    score: matched[0]?.score ?? 0,
    source: 'model',
  };
}

/** Apply one "Not a match" click to the feedback adjustments. */
export function withFeedback(
  adjust: Record<string, number>,
  filterIds: string[],
): Record<string, number> {
  const next = { ...adjust };
  for (const id of filterIds) {
    next[id] = Math.min(FEEDBACK_MAX, (next[id] ?? 0) + FEEDBACK_STEP);
  }
  return next;
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}
