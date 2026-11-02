import type { BackendId } from '../classifier/backend';
import type { FilterQuestion } from '../types';

export interface Preset extends FilterQuestion {
  enabledByDefault: boolean;
}

/** Calibration for one model: add this value to the threshold. */
type Calibration = Partial<Record<BackendId, number>>;

/**
 * Built-in filters. Each question must be specific: the model answers it
 * literally. The wording and the calibration come from the evaluation set
 * (eval/posts.json, `npm run eval`). Measure again before you change them.
 *
 * `calibration` moves the threshold of each model: d1 is cautious about some
 * filters (negative values) and quick to say yes for others (positive values).
 * The zero-shot model gives lower probabilities in general.
 *
 * `statement` is used only by the zero-shot model, so its wording can differ
 * from `question`: each one is the best wording for its own model.
 */
export const PRESETS: readonly (Preset & { calibration: Calibration })[] = [
  {
    id: 'negativity',
    label: 'Negativity and rage bait',
    question:
      'Is this post hostile, contemptuous, or written mainly to make readers angry or outraged?',
    statement: 'This post is hostile, contemptuous, or written to make readers angry.',
    calibration: { d1: 0.15, 'zero-shot': 0 },
    enabledByDefault: true,
  },
  {
    id: 'doomposting',
    label: 'Doomposting',
    question: 'Is this post doomposting: hopeless claims that everything is collapsing or doomed?',
    statement: 'This post says that everything is collapsing or doomed.',
    calibration: { d1: 0, 'zero-shot': -0.35 },
    enabledByDefault: false,
  },
  {
    id: 'engagement-bait',
    label: 'Engagement bait',
    question:
      'Does this post ask for likes, RTs, replies, tags, or follows (for example "RT if", "tag someone", "reply below", or "follow for more")?',
    statement: 'This post tells readers to like, repost, follow, or reply.',
    calibration: { d1: -0.15, 'zero-shot': -0.35 },
    enabledByDefault: true,
  },
  {
    id: 'politics',
    label: 'Politics',
    question: 'Is this post about politics, elections, politicians, or political parties?',
    statement: 'This post is about politics, elections, politicians, or political parties.',
    calibration: { d1: 0.1, 'zero-shot': -0.2 },
    enabledByDefault: false,
  },
  {
    id: 'crypto-scams',
    label: 'Crypto shilling and giveaways',
    question: 'Is this post shilling a crypto coin, token, NFT, or airdrop, or a crypto scam?',
    statement: 'This post promotes a cryptocurrency, token, NFT, airdrop, or giveaway.',
    calibration: { d1: -0.3, 'zero-shot': -0.45 },
    enabledByDefault: true,
  },
  {
    id: 'ai-hype',
    label: 'Low-effort AI hype',
    question:
      'Is this post clickbait hype about AI, like lists of AI tools that will change everything?',
    statement: 'This post is clickbait hype about AI tools.',
    calibration: { d1: -0.2, 'zero-shot': -0.4 },
    enabledByDefault: false,
  },
  {
    id: 'dunking',
    label: 'Dunking and hostile replies',
    question: 'Is this post making fun of or ridiculing a specific person?',
    statement: 'This post makes fun of a specific person.',
    calibration: { d1: -0.05, 'zero-shot': -0.25 },
    enabledByDefault: false,
  },
];

export const PRESET_IDS = PRESETS.map((preset) => preset.id);

/**
 * The model question for a filter that the user typed. On the evaluation set,
 * this wrapper improves the F1 score of typed topics (for example "posts about
 * layoffs") from 76% to 87% at the default threshold.
 */
/** Calibration for filters that the user typed (no evaluation data for them). */
export const CUSTOM_CALIBRATION: Calibration = { 'zero-shot': -0.4 };

export function customQuestion(text: string): { question: string; statement: string } {
  const trimmed = text.trim();
  if (trimmed.endsWith('?')) return { question: trimmed, statement: trimmed };
  const plain = trimmed.replace(/[.!]+$/, '');
  return {
    question: `Does this post match this description: ${plain}?`,
    statement: `This post matches this description: ${plain}.`,
  };
}
