import { storage } from '#imports';
import type { Post } from './types';

/**
 * Posts saved for your own evaluation (Settings > "Save checked posts for
 * evaluation"). They stay in local storage on this computer. The label page
 * exports them in the format of eval/posts.json.
 */
export interface SavedPost {
  id: string;
  author: string;
  text: string;
  quotedText?: string;
  imageAlts: string[];
  imageText?: string;
  /** Labels for each filter (1 = matches, 0 = does not match). Set on the label page. */
  labels?: Record<string, 0 | 1>;
  savedAt: number;
}

export const EVAL_POSTS_MAX = 1000;

export const evalPostsItem = storage.defineItem<SavedPost[]>('local:evalPosts', { fallback: [] });

/** Add posts that the model checked. Keep the newest EVAL_POSTS_MAX posts, one of each ID. */
export async function saveEvalPosts(posts: Post[]): Promise<void> {
  const saved = await evalPostsItem.getValue();
  const known = new Set(saved.map((p) => p.id));
  const added: SavedPost[] = posts
    .filter((p) => !known.has(p.id) && (p.text || p.quotedText || p.imageText))
    .map((p) => ({
      id: p.id,
      author: p.author,
      text: p.text,
      quotedText: p.quotedText,
      imageAlts: p.imageAlts,
      imageText: p.imageText,
      savedAt: Date.now(),
    }));
  if (added.length === 0) return;
  await evalPostsItem.setValue([...added, ...saved].slice(0, EVAL_POSTS_MAX));
}

/** The labeled posts in the format of eval/posts.json. */
export function toEvalFile(posts: SavedPost[]): object[] {
  return posts
    .filter((p) => p.labels)
    .map(({ id, author, text, quotedText, imageAlts, imageText, labels }) => ({
      id,
      author,
      text,
      ...(quotedText ? { quotedText } : {}),
      ...(imageAlts.length ? { imageAlts } : {}),
      ...(imageText ? { imageText } : {}),
      labels,
    }));
}
