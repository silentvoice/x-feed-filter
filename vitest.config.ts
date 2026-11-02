import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    globals: true,
    // Playwright runs the end-to-end tests (`npm run e2e`).
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
});
