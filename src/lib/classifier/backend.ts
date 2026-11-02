import type { FilterQuestion, FilterScores, Post } from '../types';

export type BackendId = 'd1' | 'zero-shot' | 'rules-only';

export type BackendStatus =
  | { state: 'unavailable'; reason: string }
  | { state: 'downloading'; progress: number }
  | { state: 'ready' };

/**
 * A model that scores posts against filters. Every backend runs on the
 * device. A backend must never send post content to a remote server.
 */
export interface ClassifierBackend {
  readonly id: BackendId;
  status(): Promise<BackendStatus>;
  /** Download weights and compile the model. Safe to call more than once. */
  load(onProgress?: (progress: number) => void): Promise<void>;
  /** Return one score map per post, in the same order as `posts`. */
  classify(posts: Post[], filters: FilterQuestion[]): Promise<FilterScores[]>;
}

/** A backend that never matches. The extension uses it when no model is available. */
export class RulesOnlyBackend implements ClassifierBackend {
  readonly id = 'rules-only' as const;
  async status(): Promise<BackendStatus> {
    return { state: 'ready' };
  }
  async load(): Promise<void> {}
  async classify(posts: Post[]): Promise<FilterScores[]> {
    return posts.map(() => ({}));
  }
}
