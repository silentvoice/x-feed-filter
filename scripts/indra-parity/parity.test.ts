// @vitest-environment node
/**
 * Compare the TypeScript Indra OCR port with the Python package (`expected.json`).
 *
 * Run: INDRA_OCR_MODEL_DIR=/path/to/indra-ocr npm run parity
 *
 * The folder must contain det.onnx, rec.onnx, and meta.json (revision v1.1.0).
 * The test is skipped without it.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { toGray } from '../../src/lib/classifier/indra/image';
import { IndraOcr } from '../../src/lib/classifier/indra/indra-ocr';
import expected from './expected.json';

const dir = process.env.INDRA_OCR_MODEL_DIR;

async function grayOf(name: string) {
  const png = PNG.sync.read(await readFile(join(import.meta.dirname, `${name}.png`)));
  return toGray(png.data, png.width, png.height);
}

describe.skipIf(!dir)('Indra OCR parity with indra_ocr (Python)', () => {
  const ocr = new IndraOcr({
    // The WebGPU build of ONNX Runtime does not run in Node. The CPU build has the same kernels.
    loadOrt: () => import('onnxruntime-web/wasm'),
    loadFile: async (path) => new Uint8Array(await readFile(join(dir as string, path))),
  });

  for (const [name, reference] of Object.entries(expected)) {
    it(`reads the same lines: ${name}`, async () => {
      const gray = await grayOf(name);
      const boxes = await ocr.detect(gray);
      // The resize is not bit-exact with OpenCV, so allow one pixel.
      expect(boxes).toHaveLength(reference.boxes.length);
      boxes.forEach((box, i) => {
        const [x0, y0, x1, y1] = reference.boxes[i] as number[];
        expect(Math.abs(box.x0 - (x0 as number))).toBeLessThan(1.5);
        expect(Math.abs(box.y0 - (y0 as number))).toBeLessThan(1.5);
        expect(Math.abs(box.x1 - (x1 as number))).toBeLessThan(1.5);
        expect(Math.abs(box.y1 - (y1 as number))).toBeLessThan(1.5);
      });
      const lines = await ocr.recognize(gray, boxes);
      expect(lines.map((line) => line.text)).toEqual(reference.lines.map((line) => line.text));
      lines.forEach((line, i) => {
        expect(Math.abs(line.conf - (reference.lines[i]?.conf ?? 0))).toBeLessThan(0.02);
      });
    });
  }

  it('reads an image in less than 200 ms on one CPU thread', async () => {
    const gray = await grayOf('small-text');
    await ocr.read(gray);
    const started = performance.now();
    const { text } = await ocr.read(gray);
    const ms = performance.now() - started;
    console.log(`small-text: ${ms.toFixed(0)} ms`);
    expect(text).toContain('Honestly the new update is great.');
    expect(ms).toBeLessThan(200);
  });
});
