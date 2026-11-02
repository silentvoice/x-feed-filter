import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Lull: a calmer feed for X',
    short_name: 'Lull',
    description:
      'Describe the posts you do not want to see on X. A small AI model on your device filters them out. No servers, no account.',
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
