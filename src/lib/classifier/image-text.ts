import type { Post } from '../types';

/** The text in one image. `confidence` is from 0 to 1. */
export interface ImageText {
  text: string;
  confidence: number;
}

/** Reads the text in an image (Indra OCR in the extension). */
export interface TextRecognizer {
  read(image: Blob): Promise<ImageText>;
}

export interface ImageTextOptions {
  /** Create the recognizer. Called once, on the first image. */
  createRecognizer: () => Promise<TextRecognizer>;
  /** Download an image. */
  fetchImage?: (url: string) => Promise<Blob>;
  /** Read at most this number of images for each post. */
  maxImages?: number;
  /** Stop reading one image after this time. */
  timeoutMs?: number;
  /** Keep the text of this number of images. */
  cacheSize?: number;
}

/** Text with a lower mean confidence is usually noise from a photo, not real text. */
export const MIN_CONFIDENCE = 0.6;
/** Ignore text that has fewer words than this. */
const MIN_WORDS = 3;
/** The model reads at most this number of characters of image text for each post. */
export const MAX_IMAGE_TEXT = 400;

/**
 * Read the text in post images (for example, screenshots of other posts) on
 * the device. The result goes into the text that the model reads.
 */
export class ImageTextReader {
  private recognizer: Promise<TextRecognizer> | null = null;
  /** Text for each image URL. An empty string means "no useful text". */
  private readonly cache = new Map<string, string>();
  /** Images that the recognizer reads now, or that wait for it. */
  private readonly reading = new Map<string, Promise<string | null>>();
  /** The recognizer reads one image at a time. */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly options: Required<ImageTextOptions>;

  constructor(options: ImageTextOptions) {
    this.options = {
      fetchImage: async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Image download failed (${response.status})`);
        return response.blob();
      },
      maxImages: 2,
      timeoutMs: 5000,
      cacheSize: 500,
      ...options,
    };
  }

  /** Add `imageText` to the posts that have images. Errors leave a post without image text. */
  async addImageText(posts: Post[]): Promise<Post[]> {
    return Promise.all(
      posts.map(async (post) => {
        const urls = post.imageUrls.slice(0, this.options.maxImages);
        if (urls.length === 0) return post;
        const texts = await Promise.all(urls.map((url) => this.textFor(url)));
        const imageText = texts.filter(Boolean).join(' | ').slice(0, MAX_IMAGE_TEXT);
        return imageText ? { ...post, imageText } : post;
      }),
    );
  }

  /**
   * The text of one image. The time limit includes the wait in the queue: a
   * batch of posts never waits longer than `timeoutMs` for its images. After the
   * limit, the image continues in the background, and its text goes into the
   * cache for the next time that the post is checked.
   */
  private async textFor(url: string): Promise<string> {
    const key = cacheKey(url);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    let reading = this.reading.get(key);
    if (!reading) {
      reading = this.serialized(() => this.read(smallImage(url)))
        .then((text) => {
          this.remember(key, text);
          return text;
        })
        .catch((error: unknown) => {
          // Do not cache failures: a later view can try again.
          console.warn('[lull] could not read image text', error);
          return null;
        })
        .finally(() => this.reading.delete(key));
      this.reading.set(key, reading);
    }
    const text = await withTimeout(reading, this.options.timeoutMs).catch(() => null);
    return text ?? '';
  }

  private remember(key: string, text: string): void {
    this.cache.set(key, text);
    if (this.cache.size > this.options.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  private async read(url: string): Promise<string> {
    this.recognizer ??= this.options.createRecognizer().catch((error: unknown) => {
      this.recognizer = null;
      throw error;
    });
    const recognizer = await this.recognizer;
    // A stopped download or a stuck decode must not block the queue.
    const image = await withTimeout(this.options.fetchImage(url), this.options.timeoutMs);
    const { text, confidence } = await withTimeout(recognizer.read(image), this.options.timeoutMs);
    return cleanText(text, confidence);
  }

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }
}

/** Keep only useful text: enough words, enough confidence, one line. */
export function cleanText(text: string, confidence: number): string {
  if (confidence < MIN_CONFIDENCE) return '';
  const words = text.split(/\s+/).filter((word) => /[a-z]{2,}/i.test(word));
  if (words.length < MIN_WORDS) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * X serves each image in many sizes (`name=small`, `medium`, `large`, ...).
 * The small size (up to 680 pixels) is enough for text in posts, and it
 * downloads fastest.
 */
function smallImage(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'pbs.twimg.com' || !parsed.searchParams.has('name')) return url;
    parsed.searchParams.set('name', 'small');
    return parsed.toString();
  } catch {
    return url;
  }
}

/** X serves the same image in many sizes. Use one cache entry for all of them. */
function cacheKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('name');
    return parsed.toString();
  } catch {
    return url;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
