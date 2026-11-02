import { storage } from '#imports';
import type { Post, Verdict } from './types';

/** Counts for one day. Local only: they never leave the device. */
export interface DailyStats {
  day: string;
  checked: number;
  filtered: number;
  byFilter: Record<string, number>;
}

export interface RecentItem {
  postId: string;
  author: string;
  snippet: string;
  reasons: string[];
  at: number;
}

const RECENT_MAX = 30;

export const statsItem = storage.defineItem<DailyStats | null>('local:stats', { fallback: null });
export const recentItem = storage.defineItem<RecentItem[]>('local:recent', { fallback: [] });

/** The local date as YYYY-MM-DD. "Today" starts at local midnight, not UTC midnight. */
export function today(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Add one batch of new verdicts (not cached ones) to the stats and the recent list. */
export async function recordActivity(posts: Post[], verdicts: Verdict[]): Promise<void> {
  if (verdicts.length === 0) return;
  const byId = new Map(posts.map((p) => [p.id, p]));
  const day = today();
  const current = await statsItem.getValue();
  const stats: DailyStats =
    current?.day === day ? current : { day, checked: 0, filtered: 0, byFilter: {} };
  const recent = await recentItem.getValue();

  for (const verdict of verdicts) {
    stats.checked += 1;
    if (!verdict.hidden) continue;
    stats.filtered += 1;
    for (const reason of verdict.reasons)
      stats.byFilter[reason] = (stats.byFilter[reason] ?? 0) + 1;
    const post = byId.get(verdict.postId);
    if (!post || recent.some((r) => r.postId === post.id)) continue;
    recent.unshift({
      postId: post.id,
      author: post.author,
      snippet: (post.text || post.quotedText || '').slice(0, 100),
      reasons: verdict.reasons,
      at: Date.now(),
    });
  }
  await statsItem.setValue(stats);
  await recentItem.setValue(recent.slice(0, RECENT_MAX));
}
