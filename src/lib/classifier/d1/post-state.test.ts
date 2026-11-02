import { postState } from './d1-backend';

describe('postState', () => {
  it('includes the quoted post, the image descriptions, and the image text', () => {
    expect(
      postState({
        id: '1',
        author: 'someone',
        text: 'Look at this',
        quotedText: 'Original post',
        imageAlts: ['A chart of prices'],
        imageUrls: ['https://pbs.twimg.com/a.jpg'],
        imageText: 'RT if you agree',
        isPromoted: false,
      }),
    ).toBe(
      [
        'Post by @someone:',
        'Look at this',
        'Quoted post: Original post',
        'Images: A chart of prices',
        'Text in images: RT if you agree',
      ].join('\n'),
    );
  });
});
