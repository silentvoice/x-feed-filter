import {
  encode,
  escapeSpecial,
  type PromptTokenizer,
  probabilities,
  renderOptions,
  temperatureKey,
} from './prompt';

/** A fake tokenizer: one token for each character, special tokens from a table. */
const SPECIAL: Record<string, number> = {
  '<|reserved_7|>': 7,
  '<|reserved_8|>': 8,
  '<|reserved_9|>': 9,
  '<|reserved_10|>': 10,
  '<|reserved_11|>': 11,
  '<|mask|>': 4,
};
const tok: PromptTokenizer = {
  encode: (text) => [...text].map((c) => 1000 + (c.codePointAt(0) ?? 0)),
  tokenId: (token) => SPECIAL[token] ?? -1,
  bosId: 1,
};

describe('escapeSpecial', () => {
  it('rewrites special token syntax', () => {
    expect(escapeSpecial('a <|mask|> b <|reserved_7|>')).toBe('a <¦mask¦> b <¦reserved_7¦>');
  });
});

describe('renderOptions', () => {
  it('renders a noul as [false, true] with default texts', () => {
    expect(renderOptions({ type: 'noul', instructions: 'Q' })).toEqual([
      'false: no, the statement does not hold',
      'true: yes, the statement holds',
    ]);
  });

  it('accepts yes/no criteria for a noul', () => {
    expect(
      renderOptions({
        type: 'noul',
        instructions: 'Q',
        criteria: { yes: 'it is', no: 'it is not' },
      }),
    ).toEqual(['false: it is not', 'true: it is']);
  });

  it('renders choice and score options', () => {
    expect(
      renderOptions({ type: 'choice', instructions: 'Q', criteria: { a: '', b: 'Bee' } }),
    ).toEqual(['a', 'b: Bee']);
    expect(renderOptions({ type: 'score', instructions: 'Q', criteria: ['low', 'high'] })).toEqual([
      'level 0: low',
      'level 1: high',
    ]);
  });
});

describe('encode', () => {
  it('places the markers on the mask tokens', () => {
    const { ids, markers } = encode(tok, 'hi', { type: 'noul', instructions: 'Q?' }, 512);
    expect(ids[0]).toBe(1);
    expect(ids[1]).toBe(7);
    expect(markers).toHaveLength(2);
    for (const m of markers) expect(ids[m]).toBe(4);
    expect(ids.at(-1)).toBe(11);
  });

  it('truncates a long state and keeps the question', () => {
    const { ids, markers } = encode(
      tok,
      'x'.repeat(1000),
      { type: 'noul', instructions: 'Q' },
      200,
    );
    expect(ids).toHaveLength(200);
    expect(ids.at(-1)).toBe(11);
    for (const m of markers) expect(ids[m]).toBe(4);
  });
});

describe('temperatureKey', () => {
  it('groups by option count', () => {
    expect(temperatureKey({ type: 'noul', instructions: 'Q' })).toBe('noul:2');
    expect(
      temperatureKey({ type: 'choice', instructions: 'Q', criteria: { a: '', b: '', c: '' } }),
    ).toBe('choice:3-5');
  });
});

describe('probabilities', () => {
  it('applies the temperature and returns a noul as [yes, no]', () => {
    const [yes, no] = probabilities({ type: 'noul', instructions: 'Q' }, [0, 2], { 'noul:2': 2 });
    expect(yes).toBeCloseTo(1 / (1 + Math.exp(-1)));
    expect((yes ?? 0) + (no ?? 0)).toBeCloseTo(1);
  });
});
