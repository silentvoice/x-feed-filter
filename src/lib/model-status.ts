import { storage } from '#imports';
import type { BackendId } from './classifier/backend';

export interface ModelStatus {
  state: 'idle' | 'loading' | 'ready' | 'error';
  /** The backend in use, after "auto" is resolved. */
  backend?: BackendId;
  /** Download progress, 0 to 1, while `state` is "loading". */
  progress: number;
  /** Error text, when `state` is "error". */
  message?: string;
}

export const IDLE_STATUS: ModelStatus = { state: 'idle', progress: 0 };

/** Session storage: the status resets when Chrome restarts. The offscreen document cannot use storage, so the background writes it. */
export const modelStatusItem = storage.defineItem<ModelStatus>('session:modelStatus', {
  fallback: IDLE_STATUS,
});

/**
 * The models that loaded at least one time on this computer. Their weights are
 * in Cache Storage, so they start in seconds. A model that is not installed
 * must download first (up to 245 MB).
 */
export const installedModelsItem = storage.defineItem<Partial<Record<BackendId, boolean>>>(
  'local:installedModels',
  { fallback: {} },
);

/** Approximate download sizes, for the user interface. */
export const DOWNLOAD_MB: Record<BackendId, number> = {
  d1: 245,
  'zero-shot': 150,
  'rules-only': 0,
};
/** Image text recognition (Indra OCR), when "Check images" is on. */
export const IMAGE_TEXT_MB = 6;
