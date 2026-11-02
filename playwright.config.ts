import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension into Chromium.
// Run `npm run build` first.
export default defineConfig({
  testDir: 'e2e',
  timeout: 300_000,
  workers: 1,
  reporter: [['list']],
});
