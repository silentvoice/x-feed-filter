import { useEffect, useState } from 'react';
import type { WarmupRequest } from '@/lib/messaging';
import { DOWNLOAD_MB, IDLE_STATUS, type ModelStatus, modelStatusItem } from '@/lib/model-status';

export const MODEL_NAMES = {
  d1: 'Liquid d1-omni-600M',
  'zero-shot': 'ModernBERT zero-shot',
  'rules-only': 'Rules only',
};

/** Start the model (and its download, the first time). */
export function startModel(): void {
  browser.runtime.sendMessage({ type: 'warmup' } satisfies WarmupRequest).catch(() => {});
}

export function useModelStatus(): ModelStatus {
  const [status, setStatus] = useState<ModelStatus>(IDLE_STATUS);
  useEffect(() => {
    modelStatusItem.getValue().then(setStatus);
    return modelStatusItem.watch((value) => setStatus(value ?? IDLE_STATUS));
  }, []);
  return status;
}

/**
 * Show the model state. By default, showing it also starts the model, so the
 * first posts do not wait. The first-run page sets `autoStart` to false and
 * starts the model when the user clicks.
 */
export function ModelStatusLine(props: { autoStart?: boolean }) {
  const status = useModelStatus();
  const autoStart = props.autoStart ?? true;

  useEffect(() => {
    if (autoStart) startModel();
  }, [autoStart]);

  const name = status.backend ? MODEL_NAMES[status.backend] : 'the model';
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
      <div className="text-red-600 text-xs dark:text-red-400" role="alert">
        <p>The model did not start. Posts stay visible until it starts.</p>
        <p className="text-neutral-500">{status.message}</p>
        <button
          type="button"
          className="mt-1 rounded border border-current px-2 py-0.5 font-medium"
          onClick={startModel}
        >
          Try again
        </button>
      </div>
    );
  }
  if (status.state === 'idle') {
    return <p className="text-neutral-500 text-xs">The model is not started.</p>;
  }
  const downloading = status.progress < 1;
  const size = status.backend ? DOWNLOAD_MB[status.backend] : 0;
  return (
    <div className="text-neutral-500 text-xs" role="status">
      <p>
        {downloading
          ? `Downloading ${name}: ${Math.round(status.progress * 100)}% of about ${size} MB. This occurs one time. Until it is complete, posts stay visible.`
          : `Starting ${name}…`}
      </p>
      {downloading && (
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
          role="progressbar"
          aria-label="Model download"
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
