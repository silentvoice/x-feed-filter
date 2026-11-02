import type { TextRecognizer } from '../image-text';
import { type Gray, toGray } from './image';
import { IndraOcr, type IndraOptions } from './indra-ocr';

/** Decode an image file to grayscale with the browser's image decoder. */
export async function decodeImage(blob: Blob): Promise<Gray> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No 2D canvas');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return toGray(data, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Indra OCR for post images. The models download on the first image (about 5.6 MB). */
export async function createIndraRecognizer(options?: IndraOptions): Promise<TextRecognizer> {
  const ocr = new IndraOcr(options);
  await ocr.load();
  return { read: async (image) => ocr.read(await decodeImage(image)) };
}
