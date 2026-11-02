import { useEffect, useState } from 'react';
import { type DailyStats, type RecentItem, recentItem, statsItem, today } from '@/lib/activity';

/** Today's counts and the recently filtered posts. The data stays on this device. */
export function Activity() {
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => {
    statsItem.getValue().then(setStats);
    recentItem.getValue().then(setRecent);
    const unwatchStats = statsItem.watch(setStats);
    const unwatchRecent = recentItem.watch((value) => setRecent(value ?? []));
    return () => {
      unwatchStats();
      unwatchRecent();
    };
  }, []);

  const current = stats?.day === today() ? stats : null;
  return (
    <div>
      <p className="text-sm">
        {current ? (
          <>
            Today: <b>{current.filtered}</b> filtered of {current.checked} checked
          </>
        ) : (
          'No posts checked today.'
        )}
      </p>
      {recent.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-neutral-500 text-xs">Recently filtered</summary>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
            {recent.map((item) => (
              <li key={item.postId} className="text-xs">
                <a
                  href={`https://x.com/${item.author}/status/${item.postId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium hover:underline"
                >
                  @{item.author}
                </a>{' '}
                <span className="text-neutral-500">· {item.reasons.join(', ')}</span>
                <p className="line-clamp-2 text-neutral-600 dark:text-neutral-400">
                  {item.snippet}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
