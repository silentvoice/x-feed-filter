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
const IMAGES: Record<string, string> = {
  LULLTEST1: resolve('e2e/fixtures/image-text.png'),
  LULLTEST2: resolve('scripts/indra-parity/no-text.png'),
};

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
  // The offscreen document fetches images outside of Playwright routing. Use data URLs.
  let html = await readFile(FIXTURE, 'utf8');
  for (const [name, file] of Object.entries(IMAGES)) {
    const url = `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
    html = html.replace(`https://pbs.twimg.com/media/${name}?format=png&name=small`, url);
  }
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

test('first run: the welcome page starts the download, and posts stay visible until then', async () => {
  // A kept profile (XFF_PROFILE_DIR) has the model already. This test needs a new profile.
  test.skip(!!process.env.XFF_PROFILE_DIR, 'Needs a new profile');
  const welcome =
    context.pages().find((p) => p.url().endsWith('/welcome.html')) ??
    (await context.waitForEvent('page', (p) => p.url().endsWith('/welcome.html')));
  await expect(welcome.getByRole('heading', { name: 'Welcome to Lull' })).toBeVisible();
  await expect(welcome.getByText(/The download is about \d+ MB/)).toBeVisible();

  // Before the download, posts are visible at once: they do not wait for the model.
  const page = await context.newPage();
  await page.goto('https://x.com/home');
  await expect(page.locator('article[data-xff-id]')).toHaveCount(5);
  await expect(page.locator('article.xff-pending')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('article.xff-blurred')).toHaveCount(0);
  await page.close();

  // Visiting x.com can start the download already. Then the page shows the progress.
  const start = welcome.getByRole('button', { name: 'Download and start' });
  if (await start.isVisible()) await start.click();
  await expect(welcome.getByText('Liquid d1-omni-600M is ready')).toBeVisible({ timeout: 240_000 });
  await expect(welcome.getByRole('link', { name: 'Open x.com' })).toBeVisible();
  await welcome.close();
});

test('filters matching posts with the on-device model', async () => {
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.text().includes('[lull]')) extensionLog.push(`[x.com] ${msg.text()}`);
  });
  await page.goto('https://x.com/home');

  // All five posts get a verdict. With a kept profile, the model starts from the cache.
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

test('reads the text in images on the device', async () => {
  const page = await context.newPage();
  await page.goto('https://x.com/home?images');
  await expect(page.locator('article[data-xff-id]')).toHaveCount(2);
  await expect(page.locator('article.xff-pending')).toHaveCount(0, { timeout: 60_000 });

  // The post text is harmless. The image asks for reposts and tags.
  await expect(article(page, '3001')).toHaveClass(/xff-blurred/);
  await expect(article(page, '3001').locator('.xff-reason')).toContainText('Engagement bait');
  await expect(article(page, '3002')).not.toHaveClass(/xff-blurred|xff-hidden/);
  await page.close();
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

test('saves checked posts for an evaluation, then labels and exports them', async () => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByText('Save checked posts for evaluation').click();

  const page = await context.newPage();
  await page.goto('https://x.com/home');
  await expect(page.locator('article.xff-pending')).toHaveCount(0, { timeout: 30_000 });
  // A new post goes to the model, so the extension saves it.
  await page.evaluate(() =>
    (window as unknown as { recycleFirstPost: (...a: string[]) => void }).recycleFirstPost(
      'citydesk',
      '4001',
      'The city council voted 7 to 2 to approve the new transit budget on Tuesday.',
    ),
  );
  await expect(article(page, '4001')).toHaveAttribute('data-xff-id', '4001', { timeout: 30_000 });
  await expect(article(page, '4001')).not.toHaveClass(/xff-pending/, { timeout: 30_000 });
  await page.close();

  const label = await context.newPage();
  await label.goto(`chrome-extension://${extensionId}/label.html`);
  const card = label.locator('article', { hasText: 'transit budget' });
  await card.getByLabel('Politics').check();
  await card.getByRole('button', { name: 'Save labels' }).click();
  await expect(label.getByText(/^1 of \d+ labeled$/)).toBeVisible();

  const [download] = await Promise.all([
    label.waitForEvent('download'),
    label.getByRole('button', { name: 'Export labeled posts' }).click(),
  ]);
  const exported = JSON.parse(await readFile((await download.path()) as string, 'utf8'));
  expect(exported).toEqual([
    expect.objectContaining({
      id: '4001',
      text: 'The city council voted 7 to 2 to approve the new transit budget on Tuesday.',
      labels: expect.objectContaining({ politics: 1, negativity: 0 }),
    }),
  ]);

  await options.getByText('Save checked posts for evaluation').click();
  await options.close();
  await label.close();
});
