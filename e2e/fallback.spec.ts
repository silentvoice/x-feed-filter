import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

/**
 * Without WebGPU, "Automatic" must select the zero-shot fallback model.
 * The fallback downloads on the first run (about 150 MB).
 */
const EXTENSION = resolve('.output/chrome-mv3');
const FIXTURE = resolve('e2e/fixtures/x-home.html');

test('uses the zero-shot model when WebGPU is not available', async () => {
  const profile =
    process.env.XFF_FALLBACK_PROFILE_DIR ?? (await mkdtemp(join(tmpdir(), 'xff-fallback-')));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      // No GPU, thus no WebGPU adapter.
      '--disable-gpu',
    ],
  });
  try {
    const html = await readFile(FIXTURE, 'utf8');
    await context.route('https://x.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html }),
    );
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    worker.on('console', (msg) => console.log(`[background] ${msg.type()}: ${msg.text()}`));
    await worker.evaluate(() =>
      (
        globalThis as unknown as { chrome: typeof import('wxt/browser').browser }
      ).chrome.storage.sync.clear(),
    );

    const page = await context.newPage();
    await page.goto('https://x.com/home');
    await expect(page.locator('article.xff-pending')).toHaveCount(0, { timeout: 240_000 });
    await expect(page.locator('article[data-xff-id="1004"]')).toHaveClass(/xff-blurred/);
    await expect(page.locator('article[data-xff-id="1002"]')).not.toHaveClass(/xff-blurred/);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByText('ModernBERT zero-shot is ready')).toBeVisible({ timeout: 60_000 });
  } finally {
    await context.close();
  }
});
