import { isDarkLine, readingOrder, resize, toGray } from './image';
import { ctcDecode, widthBatches } from './indra-ocr';

describe('toGray', () => {
  it('uses the OpenCV weights and puts transparent pixels on white', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0]);
    expect([...toGray(rgba, 3, 1).data]).toEqual([76, 150, 255]);
  });
});

describe('resize', () => {
  it('averages areas when it makes an image smaller', () => {
    const src = { width: 4, height: 1, data: new Uint8Array([0, 100, 200, 250]) };
    expect([...resize(src, 2, 1, true).data]).toEqual([50, 225]);
  });

  it('interpolates when it makes an image larger', () => {
    const src = { width: 2, height: 1, data: new Uint8Array([0, 200]) };
    expect([...resize(src, 4, 1, false).data]).toEqual([0, 50, 150, 200]);
  });
});

describe('isDarkLine', () => {
  it('finds light text on a dark ground', () => {
    const data = new Uint8Array(100).fill(30);
    data.fill(230, 40, 55);
    expect(isDarkLine({ width: 10, height: 10, data }, { x0: 0, y0: 0, x1: 9, y1: 9 })).toBe(true);
    const light = new Uint8Array(100).fill(250);
    light.fill(20, 40, 55);
    expect(isDarkLine({ width: 10, height: 10, data: light }, { x0: 0, y0: 0, x1: 9, y1: 9 })).toBe(
      false,
    );
  });
});

describe('ctcDecode', () => {
  it('drops blanks and repeats and averages the kept peaks', () => {
    const chars = ['a', 'b', 'c'];
    expect(
      ctcDecode([1, 1, 0, 1, 2, 2, 0, 3], [0.9, 0.8, 1, 0.7, 0.6, 0.5, 1, 0.8], chars),
    ).toEqual({ text: 'aabc', conf: (0.9 + 0.7 + 0.6 + 0.8) / 4 });
    expect(ctcDecode([0, 0], [1, 1], chars)).toEqual({ text: '', conf: 0 });
  });
});

describe('widthBatches', () => {
  it('groups lines of similar width, narrowest first', () => {
    expect(widthBatches([300, 100, 120, 1000])).toEqual([[1, 2], [0], [3]]);
  });
});

describe('readingOrder', () => {
  it('reads rows top to bottom and boxes in one row left to right', () => {
    const right = { x0: 300, y0: 10, x1: 400, y1: 30 };
    const left = { x0: 10, y0: 12, x1: 100, y1: 31 };
    const below = { x0: 10, y0: 60, x1: 200, y1: 80 };
    expect(readingOrder([below, right, left])).toEqual([left, right, below]);
  });
});
