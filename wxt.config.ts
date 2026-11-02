import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'X Feed Filter',
    description:
      'Filter posts on X with plain-language rules. A small AI model runs on your device. No servers, no API keys.',
    permissions: ['storage', 'offscreen'],
    host_permissions: ['*://x.com/*', '*://twitter.com/*'],
    content_security_policy: {
      // ONNX Runtime Web compiles WebAssembly. The `.wasm` file ships with the extension.
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
