import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '@/lib/settings';
import { getSettings, saveSettings, watchSettings } from '@/lib/storage';

/** Read and write extension settings. Changes sync to every open tab. */
export function useSettings(): [Settings | null, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  return [settings, update];
}
