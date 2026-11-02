import type { Post } from '../types';
import { cleanText, ImageTextReader, MAX_IMAGE_TEXT, type TextRecognizer } from './image-text';

const post = (id: string, imageUrls: string[]): Post => ({
  id,
  author: 'someone',
  text: '',
  imageAlts: [],
  imageUrls,
  isPromoted: false,
});

function fakeRecognizer(texts: Record<string, string>, confidence = 0.9) {
  const read = vi.fn(async (image: Blob) => ({
    text: texts[await image.text()] ?? '',
    confidence,
  }));
  return { read } satisfies TextRecognizer;
}

/** The fake image is a blob that contains its URL. */
const fetchImage = async (url: string) => new Blob([url]);

describe('cleanText', () => {
  it('keeps clear text on one line', () => {
    expect(cleanText('RT if you\nagree!  Follow for more', 0.85)).toBe(
      'RT if you agree! Follow for more',
    );
  });

  it('drops text with low confidence or too few words', () => {
    expect(cleanText('Breaking news about the market', 0.4)).toBe('');
    expect(cleanText('ok', 0.95)).toBe('');
    expect(cleanText('| ~ = /// ..', 0.95)).toBe('');
  });
});

describe('ImageTextReader', () => {
  it('adds the text of each image to the post', async () => {
    const recognizer = fakeRecognizer({
      'https://pbs.twimg.com/a.jpg': 'Like and repost if you agree',
      'https://pbs.twimg.com/b.jpg': 'Follow me for more tips',
    });
    const reader = new ImageTextReader({ createRecognizer: async () => recognizer, fetchImage });

    const [withImages, withoutImages] = await reader.addImageText([
      post('1', ['https://pbs.twimg.com/a.jpg', 'https://pbs.twimg.com/b.jpg']),
      post('2', []),
    ]);

    expect(withImages?.imageText).toBe('Like and repost if you agree | Follow me for more tips');
    expect(withoutImages?.imageText).toBeUndefined();
  });

  it('reads each image once, also in other sizes', async () => {
    const recognizer = fakeRecognizer({
      'https://pbs.twimg.com/a?format=jpg&name=small': 'The market will crash tomorrow',
    });
    const reader = new ImageTextReader({ createRecognizer: async () => recognizer, fetchImage });

    await reader.addImageText([post('1', ['https://pbs.twimg.com/a?format=jpg&name=small'])]);
    const [again] = await reader.addImageText([
      post('2', ['https://pbs.twimg.com/a?format=jpg&name=large']),
    ]);

    expect(recognizer.read).toHaveBeenCalledTimes(1);
    expect(again?.imageText).toBe('The market will crash tomorrow');
  });

  it('limits the number of images and the text length', async () => {
    const long = 'word '.repeat(200);
    const recognizer = fakeRecognizer({ a: long, b: long, c: long });
    const reader = new ImageTextReader({ createRecognizer: async () => recognizer, fetchImage });

    const [result] = await reader.addImageText([post('1', ['a', 'b', 'c'])]);

    expect(recognizer.read).toHaveBeenCalledTimes(2);
    expect(result?.imageText).toHaveLength(MAX_IMAGE_TEXT);
  });

  it('shows the post without image text when an image fails', async () => {
    const reader = new ImageTextReader({
      createRecognizer: async () => fakeRecognizer({}),
      fetchImage: async () => {
        throw new Error('offline');
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const [result] = await reader.addImageText([post('1', ['https://pbs.twimg.com/a.jpg'])]);

    expect(result?.imageText).toBeUndefined();
  });

  it('stops a slow image after the timeout', async () => {
    const reader = new ImageTextReader({
      createRecognizer: async () => ({ read: () => new Promise(() => {}) }),
      fetchImage,
      timeoutMs: 20,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const [result] = await reader.addImageText([post('1', ['https://pbs.twimg.com/a.jpg'])]);

    expect(result?.imageText).toBeUndefined();
  });
});
