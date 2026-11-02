import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type BrowserContext, chromium, expect, type Page, test } from '@playwright/test';

/**
 * Load the built extension in Chromium and check the full pipeline on a page
 * that copies the X timeline markup at https://x.com/home.
 *
 * The d1 model downloads from Hugging Face on the first run (about 245 MB).
 * Set XFF_PROFILE_DIR to keep the browser profile, and thus the model cache,
 * between runs.
 */
const EXTENSION = resolve('.output/chrome-mv3');
const FIXTURE = resolve('e2e/fixtures/x-home.html');

let context: BrowserContext;
let extensionId: string;
const extensionLog: string[] = [];

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext(process.env.XFF_PROFILE_DIR ?? '', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      '--enable-unsafe-webgpu',
    ],
  });
  const html = await readFile(FIXTURE, 'utf8');
  await context.route('https://x.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
  worker.on('console', (msg) => extensionLog.push(`[background] ${msg.type()}: ${msg.text()}`));
  // Start from the default settings. The profile can keep settings from an earlier run.
  await worker.evaluate(() =>
    (
      globalThis as unknown as { chrome: typeof import('wxt/browser').browser }
    ).chrome.storage.sync.clear(),
  );
});

test.afterAll(async () => {
  if (extensionLog.length > 0) console.log(`Extension console:\n${extensionLog.join('\n')}`);
  await context?.close();
});

function article(page: Page, id: string) {
  return page.locator(`article[data-xff-id="${id}"]`);
}

test('filters matching posts with the on-device model', async () => {
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.text().includes('[x-feed-filter]')) extensionLog.push(`[x.com] ${msg.text()}`);
  });
  await page.goto('https://x.com/home');

  // All five posts get a verdict. The first run includes the model download.
  await expect(page.locator('article[data-xff-id]')).toHaveCount(5);
  await expect(page.locator('article.xff-pending')).toHaveCount(0, { timeout: 240_000 });

  await expect(article(page, '1001')).toHaveClass(/xff-blurred/);
  await expect(article(page, '1001').locator('.xff-reason')).toContainText('Negativity');
  await expect(article(page, '1003')).toHaveClass(/xff-blurred/);
  await expect(article(page, '1003').locator('.xff-reason')).toContainText('Engagement bait');
  await expect(article(page, '1004')).toHaveClass(/xff-blurred/);
  await expect(article(page, '1004').locator('.xff-reason')).toContainText('Crypto');
  await expect(article(page, '1002')).not.toHaveClass(/xff-blurred|xff-hidden/);
  await expect(article(page, '1005')).not.toHaveClass(/xff-blurred|xff-hidden/);

  // "Show" reveals the post and does not open it.
  await article(page, '1001').locator('.xff-show').click();
  await expect(article(page, '1001')).not.toHaveClass(/xff-blurred/);
  await expect(page).toHaveURL('https://x.com/home');

  // X reuses an article element for a new post: the extension checks it again.
  await page.evaluate(() =>
    (window as unknown as { recycleFirstPost: (...a: string[]) => void }).recycleFirstPost(
      'scammer',
      '2001',
      'Giveaway! Send 0.1 ETH to this wallet and get 1 ETH back. Limited time airdrop.',
    ),
  );
  await expect(article(page, '2001')).toHaveClass(/xff-blurred/, { timeout: 30_000 });
});

test('"Not a match" shows the post and makes the filter less strict', async () => {
  const page = await context.newPage();
  await page.goto('https://x.com/home');
  await expect(article(page, '1003')).toHaveClass(/xff-blurred/, { timeout: 60_000 });
  await article(page, '1003').locator('.xff-not-match').click();
  await expect(article(page, '1003')).not.toHaveClass(/xff-blurred/);
  // The post stays visible after the settings change and the new check.
  await page.waitForTimeout(3000);
  await expect(article(page, '1003')).not.toHaveClass(/xff-blurred|xff-hidden/);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.getByText('Engagement bait: less strict by 5 points')).toBeVisible();
  await options.getByRole('button', { name: 'Reset feedback' }).click();
  await options.close();
  await page.close();
});

test('the popup shows the model status and the activity', async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByText('Liquid d1-omni-600M is ready')).toBeVisible({ timeout: 120_000 });
  await expect(popup.getByText(/filtered of \d+ checked/)).toBeVisible();
  await popup.getByText('Recently filtered').click();
  await expect(popup.getByText('@moonboy')).toBeVisible();
  await popup.close();
});

test('hides filtered posts when the action is "Hide"', async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByText('Hide', { exact: true }).click();
  await popup.close();

  const page = await context.newPage();
  await page.goto('https://x.com/home');
  await expect(article(page, '1003')).toHaveClass(/xff-hidden/, { timeout: 60_000 });
  await expect(article(page, '1003')).toBeHidden();
  await expect(article(page, '1002')).toBeVisible();
});
