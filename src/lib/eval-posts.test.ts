import { fakeBrowser } from 'wxt/testing/fake-browser';
import { EVAL_POSTS_MAX, evalPostsItem, saveEvalPosts, toEvalFile } from './eval-posts';
import type { Post } from './types';

const post = (id: string, text = `Post ${id}`): Post => ({
  id,
  author: 'someone',
  text,
  imageAlts: [],
  imageUrls: ['https://pbs.twimg.com/a.jpg'],
  isPromoted: false,
});

describe('saveEvalPosts', () => {
  beforeEach(() => fakeBrowser.reset());

  it('keeps one copy of each post, newest first, without image URLs', async () => {
    await saveEvalPosts([post('1'), post('2')]);
    await saveEvalPosts([post('2'), post('3'), post('4', '')]);

    const saved = await evalPostsItem.getValue();
    expect(saved.map((p) => p.id)).toEqual(['3', '1', '2']);
    expect(saved[0]).not.toHaveProperty('imageUrls');
  });

  it(`keeps at most ${EVAL_POSTS_MAX} posts`, async () => {
    await saveEvalPosts(Array.from({ length: EVAL_POSTS_MAX + 5 }, (_, i) => post(String(i))));
    expect(await evalPostsItem.getValue()).toHaveLength(EVAL_POSTS_MAX);
  });
});

describe('toEvalFile', () => {
  it('exports only labeled posts, in the format of eval/posts.json', () => {
    expect(
      toEvalFile([
        { id: '1', author: 'a', text: 'Hi', imageAlts: [], savedAt: 0, labels: { politics: 1 } },
        { id: '2', author: 'b', text: 'Not labeled', imageAlts: [], savedAt: 0 },
        {
          id: '3',
          author: 'c',
          text: '',
          imageAlts: [],
          imageText: 'RT if you agree',
          savedAt: 0,
          labels: { 'engagement-bait': 1 },
        },
      ]),
    ).toEqual([
      { id: '1', author: 'a', text: 'Hi', labels: { politics: 1 } },
      {
        id: '3',
        author: 'c',
        text: '',
        imageText: 'RT if you agree',
        labels: { 'engagement-bait': 1 },
      },
    ]);
  });
});
