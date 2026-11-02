/** Data that the content script extracts from one post on X. */
export interface Post {
  /** Status ID from the post permalink. */
  id: string;
  /** Author handle without the leading "@". */
  author: string;
  text: string;
  /** Text of a quoted post, if the post quotes one. */
  quotedText?: string;
  /** Alt text of attached images, if the author added it. */
  imageAlts: string[];
  /** Absolute URLs of attached images. */
  imageUrls: string[];
  isPromoted: boolean;
}

/** One filter, as the classifier sees it: a yes/no question about a post. */
export interface FilterQuestion {
  id: string;
  label: string;
  /** Plain-language description, for example "Rage bait or outrage farming". */
  question: string;
  /** The same filter as a statement, for zero-shot (NLI) models. */
  statement?: string;
  /** Threshold change for each model, from the evaluation set. */
  calibration?: Partial<Record<'d1' | 'zero-shot' | 'rules-only', number>>;
}

/** Probability (0 to 1) that a post matches each filter, keyed by filter ID. */
export type FilterScores = Record<string, number>;

export interface Verdict {
  postId: string;
  hidden: boolean;
  /** Labels of the filters that matched. Empty if the post is visible. */
  reasons: string[];
  /** IDs of the filters that matched, in the same order as `reasons`. */
  filterIds?: string[];
  /** Highest score among the matched filters. */
  score: number;
  source: 'rule' | 'model' | 'cache';
}
