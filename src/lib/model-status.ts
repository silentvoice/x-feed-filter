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
