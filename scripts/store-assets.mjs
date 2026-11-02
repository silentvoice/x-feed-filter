/**
 * Make the Chrome Web Store images from the built extension:
 *
 * - store/screenshots/*.png (1280 × 800)
 * - store/promo-small.png (440 × 280) and store/promo-marquee.png (1400 × 560)
 *
 * The feed is store/demo-feed.html with fictional posts. The extension runs on
 * it with the real model, so the blur and the reasons are real.
 *
 * Run: npm run build && npm run store:assets
 * Set XFF_PROFILE_DIR to keep the model download between runs.
 */
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const EXTENSION = resolve('.output/chrome-mv3');
const OUT = resolve('store');
const SIZE = { width: 1280, height: 800 };

const ICON = await readFile(resolve('assets/brand/icon.svg'), 'utf8');
const imageText = `data:image/png;base64,${(await readFile(resolve('e2e/fixtures/image-text.png'))).toString('base64')}`;
const feed = (await readFile(resolve('store/demo-feed.html'), 'utf8')).replace(
  'IMAGE_TEXT',
  imageText,
);

await mkdir(join(OUT, 'screenshots'), { recursive: true });
const profile = process.env.XFF_PROFILE_DIR ?? (await mkdtemp(join(tmpdir(), 'lull-store-')));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: false,
  viewport: SIZE,
  deviceScaleFactor: 1,
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    '--enable-unsafe-webgpu',
  ],
});

/** A brand page with a headline and an image, for the screenshots that show a small UI. */
function frame(headline, text, image, imageWidth) {
  return `<!doctype html><html><body style="margin:0;width:${SIZE.width}px;height:${SIZE.height}px;display:flex;align-items:center;gap:72px;padding:0 96px;box-sizing:border-box;background:linear-gradient(135deg,#f7f5f0,#e6ede8);font-family:-apple-system,'Segoe UI',sans-serif;color:#1f2a24">
    <div style="flex:1"><div style="width:72px">${ICON}</div>
      <h1 style="font-size:46px;line-height:1.1;margin:24px 0 16px">${headline}</h1>
      <p style="font-size:22px;line-height:1.4;color:#5b6660;margin:0">${text}</p></div>
    <img src="${image}" style="width:${imageWidth}px;border-radius:14px;box-shadow:0 20px 60px rgb(31 42 36 / .25)"></body></html>`;
}

async function shotOf(url, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(url);
  await page.waitForTimeout(800);
  const png = await page.screenshot();
  await page.close();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function render(html, path, viewport = SIZE) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.setContent(html);
  await page.waitForTimeout(300);
  await page.screenshot({ path });
  await page.close();
}

try {
  await context.route('https://x.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: feed }),
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const base = `chrome-extension://${new URL(worker.url()).host}`;

  // 1. The welcome page (before the model starts, on a new profile).
  const welcome = await context.newPage();
  await welcome.goto(`${base}/welcome.html`);
  await welcome.waitForTimeout(800);
  await welcome.screenshot({ path: join(OUT, 'screenshots', '4-welcome.png') });
  await welcome.close();

  // Start the model and wait for it.
  const popup = await context.newPage();
  await popup.goto(`${base}/popup.html`);
  await popup.getByText(/is ready/).waitFor({ timeout: 300_000 });
  await popup.close();

  // 2. The feed with filtered posts.
  const page = await context.newPage();
  await page.goto('https://x.com/home');
  // Wait until the extension checked every post.
  await page.waitForFunction(
    () => {
      const articles = [...document.querySelectorAll('article')];
      return (
        articles.length > 0 &&
        articles.every((a) => a.dataset.xffId && !a.classList.contains('xff-pending'))
      );
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'screenshots', '1-feed.png') });
  const blurred = await page.locator('article.xff-blurred').count();
  console.log(`Feed: ${blurred} posts blurred`);
  await page.close();

  // 3. The popup, in a frame.
  const popupImage = await shotOf(`${base}/popup.html`, { width: 320, height: 600 });
  await render(
    frame(
      'See what Lull filtered.',
      'Daily counts, recent posts, and one switch for each filter.',
      popupImage,
      340,
    ),
    join(OUT, 'screenshots', '2-popup.png'),
  );

  // 4. The settings page, in a frame.
  const settingsImage = await shotOf(`${base}/options.html`, { width: 720, height: 900 });
  await render(
    frame(
      'Describe what you do not want to see.',
      'Write your own filters in plain language. A small AI model on your computer checks each post.',
      settingsImage,
      560,
    ),
    join(OUT, 'screenshots', '3-settings.png'),
  );

  // Promotional tiles.
  const tile = (
    width,
    height,
    title,
    sub,
  ) => `<!doctype html><html><body style="margin:0;width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;gap:${height / 8}px;background:linear-gradient(135deg,#6e8f7d,#3f5f50);font-family:-apple-system,'Segoe UI',sans-serif;color:#fff">
    <div style="width:${height * 0.42}px;filter:drop-shadow(0 8px 24px rgb(0 0 0 / .25))">${ICON}</div>
    <div><div style="font-size:${height * 0.22}px;font-weight:800;line-height:1">${title}</div>
    <div style="font-size:${height * 0.085}px;opacity:.9;margin-top:${height * 0.04}px">${sub}</div></div></body></html>`;
  await render(tile(440, 280, 'Lull', 'A calmer feed for X'), join(OUT, 'promo-small.png'), {
    width: 440,
    height: 280,
  });
  await render(
    tile(1400, 560, 'Lull', 'A calmer feed for X. On your device.'),
    join(OUT, 'promo-marquee.png'),
    { width: 1400, height: 560 },
  );
  console.log(`Wrote the images to ${OUT}`);
} finally {
  await context.close();
}
