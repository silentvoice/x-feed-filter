import type { FilterQuestion } from '../types';

export interface Preset extends FilterQuestion {
  enabledByDefault: boolean;
}

/**
 * Built-in filters. Each question must be specific: the model answers it
 * literally. Tune the wording against the evaluation set before you change it.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'negativity',
    label: 'Negativity and rage bait',
    question:
      'Is this post hostile, contemptuous, or written mainly to make readers angry or outraged?',
    enabledByDefault: true,
  },
  {
    id: 'doomposting',
    label: 'Doomposting',
    question:
      'Does this post predict disaster or collapse in an exaggerated, hopeless way without useful information?',
    enabledByDefault: false,
  },
  {
    id: 'engagement-bait',
    label: 'Engagement bait',
    question:
      'Does this post mainly ask for likes, reposts, follows, or replies (for example "like if you agree" or "follow for more")?',
    enabledByDefault: true,
  },
  {
    id: 'politics',
    label: 'Politics',
    question: 'Is this post about politics, elections, politicians, or political parties?',
    enabledByDefault: false,
  },
  {
    id: 'crypto-scams',
    label: 'Crypto shilling and giveaways',
    question:
      'Does this post promote a cryptocurrency, token, NFT, airdrop, or giveaway, or look like a scam?',
    enabledByDefault: true,
  },
  {
    id: 'ai-hype',
    label: 'Low-effort AI hype',
    question:
      'Is this post low-effort hype about AI tools, such as "10 AI tools that will replace your job" threads?',
    enabledByDefault: false,
  },
  {
    id: 'dunking',
    label: 'Dunking and hostile replies',
    question: 'Does this post mock, insult, or pile on another person?',
    enabledByDefault: false,
  },
];

export const PRESET_IDS = PRESETS.map((preset) => preset.id);
