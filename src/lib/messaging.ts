import type { BackendId } from './classifier/backend';
import type { FilterQuestion, FilterScores, Post, Verdict } from './types';

/** Content script → background. */
export interface ClassifyRequest {
  type: 'classify';
  posts: Post[];
}

export interface ClassifyResponse {
  verdicts: Verdict[];
}

/** Background → offscreen document. */
export interface OffscreenClassifyRequest {
  target: 'offscreen';
  type: 'classify';
  backend: BackendId;
  posts: Post[];
  filters: FilterQuestion[];
}

export interface OffscreenClassifyResponse {
  scores: FilterScores[];
  /** Set when the model failed. The posts stay visible. */
  error?: string;
}

export function isClassifyRequest(message: unknown): message is ClassifyRequest {
  return (message as ClassifyRequest)?.type === 'classify' && !('target' in (message as object));
}

export function isOffscreenRequest(message: unknown): message is OffscreenClassifyRequest {
  return (message as OffscreenClassifyRequest)?.target === 'offscreen';
}
