// @vitest-environment node
/**
 * Compare the TypeScript d1 port with the Python reference (`expected.json`).
 *
 * Run: D1_MODEL_DIR=/path/to/d1-omni-600M-ONNX npm run parity
 *
 * The folder must contain tokenizer.json, tokenizer_config.json, config.json,
 * and onnx/model_quantized.onnx(_data) and onnx/model_q4.onnx(_data). The test
 * is skipped without it.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Tokenizer } from '@huggingface/tokenizers';
import { D1Backend } from '../../src/lib/classifier/d1/d1-backend';
import { encode, type Question } from '../../src/lib/classifier/d1/prompt';
import expectedQ4 from './expected-q4.json';
import expectedQ8 from './expected-q8.json';

const dir = process.env.D1_MODEL_DIR;

interface Case {
  state: string;
  question: Question;
  ids: number[];
  markers: number[];
  probabilities: number[];
}
const cases = expectedQ8 as Case[];
const REFERENCES = { q8: expectedQ8 as Case[], q4: expectedQ4 as Case[] };

describe.skipIf(!dir)('d1 parity with prompt.py and ONNX Runtime (Python)', () => {
  it('builds the same token IDs and marker positions', async () => {
    const root = dir as string;
    const json = async (name: string) => JSON.parse(await readFile(join(root, name), 'utf8'));
    const tokenizer = new Tokenizer(
      await json('tokenizer.json'),
      await json('tokenizer_config.json'),
    );
    const tok = {
      encode: (text: string) => tokenizer.encode(text, { add_special_tokens: false }).ids,
      tokenId: (token: string) => tokenizer.token_to_id(token) as number,
      bosId: 1,
    };
    for (const c of cases) {
      expect(encode(tok, c.state, c.question, 512), c.state).toEqual({
        ids: c.ids,
        markers: c.markers,
      });
    }
  });

  it.each(['q8', 'q4'] as const)(
    'gives the same %s probabilities with ONNX Runtime Web (WebAssembly)',
    async (dtype) => {
      const root = dir as string;
      const backend = new D1Backend({
        dtype,
        device: 'wasm',
        loadOrt: () => import('onnxruntime-web/wasm'),
        loadFile: async (path) => new Uint8Array(await readFile(join(root, path))),
      });
      let worst = 0;
      for (const c of REFERENCES[dtype]) {
        const probs = (await backend.decide([c.state], [c.question]))[0]?.[0];
        for (const [i, p] of (probs ?? []).entries()) {
          worst = Math.max(worst, Math.abs(p - (c.probabilities[i] ?? 0)));
        }
      }
      console.log(`${dtype}: max |Δ| vs Python = ${worst.toFixed(5)}`);
      expect(worst).toBeLessThan(0.01);
    },
    300_000,
  );

  it('answers requests that arrive at the same time', async () => {
    const root = dir as string;
    const backend = new D1Backend({
      device: 'wasm',
      loadOrt: () => import('onnxruntime-web/wasm'),
      loadFile: async (path) => new Uint8Array(await readFile(join(root, path))),
    });
    const question: Question = { type: 'noul', instructions: 'Is this post hostile?' };
    const results = await Promise.all([
      backend.decide(['You are an idiot.'], [question]),
      backend.decide(['Nice garden!'], [question]),
      backend.decide(['Good morning.'], [question]),
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]?.[0]?.[0]?.[0]).toBeGreaterThan(results[1]?.[0]?.[0]?.[0] ?? 1);
  }, 300_000);
});
