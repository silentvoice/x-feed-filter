import { useEffect, useState } from 'react';
import type { WarmupRequest } from '@/lib/messaging';
import { IDLE_STATUS, type ModelStatus, modelStatusItem } from '@/lib/model-status';

const NAMES = {
  d1: 'Liquid d1-omni-600M',
  'zero-shot': 'ModernBERT zero-shot',
  'rules-only': 'Rules only',
};

/** Show the model state. Opening the popup also starts the model, so the first posts do not wait. */
export function ModelStatusLine() {
  const [status, setStatus] = useState<ModelStatus>(IDLE_STATUS);

  useEffect(() => {
    modelStatusItem.getValue().then(setStatus);
    browser.runtime.sendMessage({ type: 'warmup' } satisfies WarmupRequest).catch(() => {});
    return modelStatusItem.watch((value) => setStatus(value ?? IDLE_STATUS));
  }, []);

  const name = status.backend ? NAMES[status.backend] : 'the model';
  if (status.state === 'ready') {
    return (
      <p className="flex items-center gap-2 text-neutral-500 text-xs">
        <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
        {name} is ready. It runs on your device.
      </p>
    );
  }
  if (status.state === 'error') {
    return (
      <p className="text-red-600 text-xs dark:text-red-400" role="alert">
        The model did not start. Posts stay visible. ({status.message})
      </p>
    );
  }
  const downloading = status.state === 'loading' && status.progress < 1;
  return (
    <div className="text-neutral-500 text-xs" role="status">
      <p>
        {downloading
          ? `Downloading ${name}: ${Math.round(status.progress * 100)}%. This occurs one time.`
          : `Starting ${name}…`}
      </p>
      {downloading && (
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(status.progress * 100)}
        >
          <div className="h-full bg-brand-500" style={{ width: `${status.progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}
