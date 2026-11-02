import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Development server for the d1 benchmark page.
 *
 * - `/model/*` reads files from D1_MODEL_DIR, so the benchmark does not download the model again.
 * - `/ort/*` serves the ONNX Runtime Web `.wasm` and `.mjs` files from node_modules.
 */
function staticDir(prefix: string, dir: string | undefined): Plugin {
  return {
    name: `static:${prefix}`,
    configureServer(server) {
      server.middlewares.use(prefix, (req, res, next) => {
        if (!dir) return next();
        const file = join(dir, decodeURIComponent((req.url ?? '').split('?')[0] ?? ''));
        if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) return next();
        const type = file.endsWith('.mjs')
          ? 'text/javascript'
          : file.endsWith('.wasm')
            ? 'application/wasm'
            : 'application/octet-stream';
        res.setHeader('Content-Type', type);
        res.setHeader('Content-Length', statSync(file).size);
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [
    staticDir('/model', process.env.D1_MODEL_DIR && resolve(process.env.D1_MODEL_DIR)),
    staticDir('/ort', resolve(import.meta.dirname, '../node_modules/onnxruntime-web/dist')),
  ],
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: { port: 5199, fs: { allow: [resolve(import.meta.dirname, '..')] } },
});
