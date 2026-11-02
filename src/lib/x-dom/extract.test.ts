import { extractPost } from './extract';

function article(html: string): Element {
  const el = document.createElement('article');
  el.setAttribute('data-testid', 'tweet');
  el.innerHTML = html;
  return el;
}

describe('extractPost', () => {
  it('reads the ID, author, text, quoted text, and images', () => {
    const post = extractPost(
      article(`
        <a href="/alice/status/12345"><time datetime="2026-11-01">1h</time></a>
        <div data-testid="tweetText">Main text</div>
        <div role="link"><div data-testid="tweetText">Quoted text</div></div>
        <div data-testid="tweetPhoto"><img alt="A cat on a desk" src="https://pbs.twimg.com/a.jpg"></div>
        <div data-testid="tweetPhoto"><img alt="Image" src="https://pbs.twimg.com/b.jpg"></div>
      `),
    );
    expect(post).toEqual({
      id: '12345',
      author: 'alice',
      text: 'Main text',
      quotedText: 'Quoted text',
      imageAlts: ['A cat on a desk'],
      imageUrls: ['https://pbs.twimg.com/a.jpg', 'https://pbs.twimg.com/b.jpg'],
      isPromoted: false,
    });
  });

  it('detects promoted posts', () => {
    const post = extractPost(
      article(`
        <a href="/brand/status/1"><time>now</time></a>
        <span>Ad</span>
      `),
    );
    expect(post?.isPromoted).toBe(true);
  });

  it('returns null when the post has no permalink yet', () => {
    expect(extractPost(article('<div data-testid="tweetText">Loading</div>'))).toBeNull();
  });
});
