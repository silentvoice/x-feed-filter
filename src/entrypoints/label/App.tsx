import { useEffect, useState } from 'react';
import { evalPostsItem, type SavedPost, toEvalFile } from '@/lib/eval-posts';
import { PRESETS } from '@/lib/filters/presets';

const BUTTON =
  'rounded-lg border border-neutral-300 px-3 py-1.5 font-medium text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900';

/** Download the labeled posts as a JSON file in the format of eval/posts.json. */
function exportPosts(posts: SavedPost[]): void {
  const blob = new Blob([`${JSON.stringify(toEvalFile(posts), null, 1)}\n`], {
    type: 'application/json',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `lull-labeled-posts-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function PostCard(props: {
  post: SavedPost;
  onSave: (post: SavedPost) => void;
  onDelete: () => void;
}) {
  const { post } = props;
  const [labels, setLabels] = useState<Record<string, 0 | 1>>(
    post.labels ?? Object.fromEntries(PRESETS.map((p) => [p.id, 0])),
  );
  return (
    <article
      className={`rounded-xl border p-4 ${post.labels ? 'border-brand-400' : 'border-neutral-200 dark:border-neutral-800'}`}
    >
      <p className="font-semibold">@{post.author}</p>
      <p className="mt-1 whitespace-pre-wrap">{post.text}</p>
      {post.quotedText && (
        <p className="mt-2 border-neutral-300 border-l-2 pl-3 text-neutral-500">
          {post.quotedText}
        </p>
      )}
      {post.imageText && (
        <p className="mt-2 text-neutral-500 text-sm">Text in images: {post.imageText}</p>
      )}
      <fieldset className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <legend className="sr-only">Filters that this post matches</legend>
        {PRESETS.map((preset) => (
          <label key={preset.id} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="accent-brand-500"
              checked={labels[preset.id] === 1}
              onChange={(e) => setLabels({ ...labels, [preset.id]: e.target.checked ? 1 : 0 })}
            />
            {preset.label}
          </label>
        ))}
      </fieldset>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-sm text-white"
          onClick={() => props.onSave({ ...post, labels })}
        >
          {post.labels ? 'Update labels' : 'Save labels'}
        </button>
        <button type="button" className={BUTTON} onClick={props.onDelete}>
          Delete post
        </button>
      </div>
    </article>
  );
}

/**
 * Label the posts that Lull saved (Settings > "Save checked posts for
 * evaluation"), then export them to measure the filters on real posts.
 */
export function App() {
  const [posts, setPosts] = useState<SavedPost[] | null>(null);
  const [onlyUnlabeled, setOnlyUnlabeled] = useState(true);

  useEffect(() => {
    evalPostsItem.getValue().then(setPosts);
    return evalPostsItem.watch((value) => setPosts(value ?? []));
  }, []);
  if (!posts) return null;

  const save = (next: SavedPost[]) => {
    setPosts(next);
    void evalPostsItem.setValue(next);
  };
  const labeled = posts.filter((p) => p.labels).length;
  const shown = onlyUnlabeled ? posts.filter((p) => !p.labels) : posts;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8 text-base text-neutral-900 dark:text-neutral-100">
      <h1 className="font-bold text-2xl">Label posts for an evaluation</h1>
      <p className="mt-2 text-neutral-500">
        For each post, select the filters that it really matches, then click Save labels. The posts
        stay on your computer. To measure the filters, export the labeled posts to{' '}
        <code>eval/local/</code> in the repository and run{' '}
        <code>npm run eval -- d1 --posts eval/local/&lt;file&gt;.json</code>. See{' '}
        <a
          className="text-brand-600 underline dark:text-brand-400"
          href="https://github.com/silentvoice/x-feed-filter/blob/main/docs/evaluation.md#evaluate-with-your-own-posts"
        >
          Evaluation
        </a>
        .
      </p>
      <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-3 border-neutral-200 border-b bg-white py-3 dark:border-neutral-800 dark:bg-neutral-950">
        <span className="font-medium">
          {labeled} of {posts.length} labeled
        </span>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="accent-brand-500"
            checked={onlyUnlabeled}
            onChange={(e) => setOnlyUnlabeled(e.target.checked)}
          />
          Show only posts without labels
        </label>
        <span className="flex-1" />
        <button
          type="button"
          className={BUTTON}
          disabled={labeled === 0}
          onClick={() => exportPosts(posts)}
        >
          Export labeled posts
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={posts.length === 0}
          onClick={() => {
            if (confirm(`Delete all ${posts.length} saved posts from this computer?`)) save([]);
          }}
        >
          Delete all
        </button>
      </div>
      {posts.length === 0 ? (
        <p className="mt-6 text-neutral-500">
          No saved posts. Turn on "Save checked posts for evaluation" in the settings, then scroll
          your feed on x.com.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {shown.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onSave={(next) => save(posts.map((p) => (p.id === next.id ? next : p)))}
              onDelete={() => save(posts.filter((p) => p.id !== post.id))}
            />
          ))}
        </div>
      )}
    </main>
  );
}
