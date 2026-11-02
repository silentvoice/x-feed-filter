import type { BackendChoice, BackendId } from './classifier/backend';
import type { ModelStatus } from './model-status';
import type { FilterQuestion, FilterScores, Post, Verdict } from './types';

/** Content script → background. */
export interface ClassifyRequest {
  type: 'classify';
  posts: Post[];
}

export interface ClassifyResponse {
  verdicts: Verdict[];
}

/** Popup → background: start the model before the first post arrives. */
export interface WarmupRequest {
  type: 'warmup';
}

/** Content script → background: the user clicked "Not a match" on a filtered post. */
export interface FeedbackRequest {
  type: 'feedback';
  postId: string;
  filterIds: string[];
}

/** Background → offscreen document. */
export interface OffscreenClassifyRequest {
  target: 'offscreen';
  type: 'classify';
  backend: BackendChoice;
  posts: Post[];
  filters: FilterQuestion[];
}

/** Background → offscreen document: load the model, classify nothing. */
export interface OffscreenWarmupRequest {
  target: 'offscreen';
  type: 'warmup';
  backend: BackendChoice;
}

export interface OffscreenClassifyResponse {
  scores: FilterScores[];
  /** The backend that made the scores, after "auto" is resolved. */
  backend?: BackendId;
  /** Set when the model failed. The posts stay visible. */
  error?: string;
}

/** Offscreen document → background. */
export interface ModelStatusMessage {
  type: 'model-status';
  status: ModelStatus;
}

export function isClassifyRequest(message: unknown): message is ClassifyRequest {
  return (message as ClassifyRequest)?.type === 'classify' && !('target' in (message as object));
}

export function isWarmupRequest(message: unknown): message is WarmupRequest {
  return (message as WarmupRequest)?.type === 'warmup' && !('target' in (message as object));
}

export function isOffscreenRequest(
  message: unknown,
): message is OffscreenClassifyRequest | OffscreenWarmupRequest {
  return (message as OffscreenClassifyRequest)?.target === 'offscreen';
}

export function isModelStatusMessage(message: unknown): message is ModelStatusMessage {
  return (message as ModelStatusMessage)?.type === 'model-status';
}

export function isFeedbackRequest(message: unknown): message is FeedbackRequest {
  return (message as FeedbackRequest)?.type === 'feedback';
}
