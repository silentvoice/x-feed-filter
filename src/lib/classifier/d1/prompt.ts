/**
 * TypeScript port of `prompt.py` from LiquidAI/d1-omni-600M (text path only).
 * https://huggingface.co/LiquidAI/d1-omni-600M/blob/main/prompt.py
 *
 * A question is rendered against the state as one sequence:
 *
 *   <bos> <state> state <q> instructions <opt> <mask> option_0 </opt> <opt> <mask> option_1 </opt> ... <decide>
 *
 * The model scores the hidden state at every `<mask>` and softmaxes over the
 * question's options. Keep this file in step with the Python original: the
 * parity test in `scripts/d1-parity` compares the token IDs.
 */

export const QTYPES = { choice: 0, score: 1, noul: 2 } as const;
export type QuestionType = keyof typeof QTYPES;

const DELIM = {
  state: '<|reserved_7|>',
  q: '<|reserved_8|>',
  opt: '<|reserved_9|>',
  optEnd: '<|reserved_10|>',
  decide: '<|reserved_11|>',
} as const;
const MARKER = '<|mask|>';
const SPECIAL = /<\|([A-Za-z0-9_]+)\|>/g;

export type Question =
  | { type: 'noul'; instructions: string; criteria?: Record<string, string> }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

/** The tokenizer calls that the prompt builder needs. */
export interface PromptTokenizer {
  /** Token IDs of `text`, without special tokens. */
  encode(text: string): number[];
  /** ID of one special token. */
  tokenId(token: string): number;
  bosId: number;
}

export function optionCount(q: Question): number {
  return q.type === 'noul' ? 2 : Object.keys(q.criteria).length;
}

/** `<|name|>` → `<¦name¦>`, so caller text cannot emit a delimiter or marker token. */
export function escapeSpecial(text: string): string {
  return text.replace(SPECIAL, '<¦$1¦>');
}

/** Option texts in the model's order. A noul is read as [false, true]. */
export function renderOptions(q: Question): string[] {
  if (q.type === 'choice') {
    return Object.entries(q.criteria).map(([k, v]) => (v === '' ? k : `${k}: ${v}`));
  }
  if (q.type === 'score') {
    return q.criteria.map((c, i) => `level ${i}: ${c}`);
  }
  const crit = q.criteria ?? {};
  const no = crit.false ?? crit.no;
  const yes = crit.true ?? crit.yes;
  return [
    `false: ${no ? no : 'no, the statement does not hold'}`,
    `true: ${yes ? yes : 'yes, the statement holds'}`,
  ];
}

/**
 * Token IDs of one question over one state, and the position of each
 * option's marker. The option block gets max(96, min(24k + 32, maxLen / 2))
 * tokens, shared out evenly. The state is truncated on the right to the room
 * that is left.
 */
export function encode(
  tok: PromptTokenizer,
  state: string,
  q: Question,
  maxLen: number,
  perOption = 24,
): { ids: number[]; markers: number[] } {
  const enc = (s: string) => tok.encode(escapeSpecial(s));
  const opts = renderOptions(q);
  const budget = Math.max(96, Math.min(opts.length * perOption + 32, Math.floor(maxLen / 2)));
  const per = Math.max(2, Math.floor((budget - 3 * opts.length) / opts.length));

  const question = [tok.tokenId(DELIM.q), ...enc(q.instructions)].slice(0, Math.max(16, budget));
  let markers: number[] = [];
  for (const text of opts) {
    markers.push(question.length + 1);
    question.push(
      tok.tokenId(DELIM.opt),
      tok.tokenId(MARKER),
      ...enc(` ${text}`).slice(0, per),
      tok.tokenId(DELIM.optEnd),
    );
  }
  question.push(tok.tokenId(DELIM.decide));

  const room = Math.max(0, maxLen - question.length - 2);
  const stateIds = [tok.tokenId(DELIM.state), ...enc(state).slice(0, room)];
  const ids = [tok.bosId, ...stateIds, ...question].slice(0, maxLen);
  markers = markers.map((m) => m + 1 + stateIds.length);
  if ((markers.at(-1) ?? 0) >= maxLen) throw new Error('The options do not fit in the context.');
  return { ids, markers };
}

/** Key into the calibration temperatures in the model's `config.json`. */
export function temperatureKey(q: Question): string {
  const k = optionCount(q);
  return `${q.type}:${k <= 2 ? '2' : k <= 5 ? '3-5' : k <= 10 ? '6-10' : '11+'}`;
}

/**
 * Turn the raw logits of one question into probabilities in option order.
 * A noul comes back as [P(yes), P(no)], as in the Python original.
 */
export function probabilities(
  q: Question,
  logits: ArrayLike<number>,
  temperatures: Record<string, number>,
): number[] {
  const t = temperatures[temperatureKey(q)] ?? temperatures[q.type] ?? 1;
  const z = Array.from({ length: optionCount(q) }, (_, i) => (logits[i] ?? 0) / t);
  const max = Math.max(...z);
  const exp = z.map((v) => Math.exp(v - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  const p = exp.map((v) => v / sum);
  // The model reads a noul as [false, true].
  return q.type === 'noul' ? p.reverse() : p;
}
