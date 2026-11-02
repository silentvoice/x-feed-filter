// Render the SVG icons to the PNG sizes that Chrome needs.
// Run: node scripts/render-icons.mjs   (needs `npx playwright install chromium`)
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const SIZES = [
  [16, 'assets/brand/icon-small.svg'],
  [32, 'assets/brand/icon-small.svg'],
  [48, 'assets/brand/icon.svg'],
  [96, 'assets/brand/icon.svg'],
  [128, 'assets/brand/icon.svg'],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [size, file] of SIZES) {
  const svg = await readFile(file, 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: `public/icon/${size}.png`, omitBackground: true });
  console.log(`public/icon/${size}.png`);
}
await browser.close();
