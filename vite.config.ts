import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Đọc version từ package.json để inject vào app
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string };

/**
 * Plugin copy WASM của libredwg-web vào public/ để Vite serve đúng đường dẫn.
 * Emscripten dùng locateFile('libredwg-web.wasm') → cần file tại /libredwg-web.wasm (public root).
 */
function copyLibreDwgWasm() {
  const src  = resolve(__dirname, 'node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm');
  const dest = resolve(__dirname, 'public/libredwg-web.wasm');
  function doCopy() {
    if (existsSync(src) && !existsSync(dest)) {
      copyFileSync(src, dest);
      console.info('[copyLibreDwgWasm] Đã sao chép libredwg-web.wasm → public/');
    }
  }
  return {
    name: 'copy-libredwg-wasm',
    buildStart: doCopy,
    configureServer: doCopy,
  };
}

/**
 * Plugin giả lập api/elevation.ts (Vercel Edge Function) khi chạy `vite dev` ở local.
 * Vite không có Vercel Functions runtime → nếu không có middleware này, fetch('/api/elevation')
 * sẽ rơi xuống Vite serve file `api/elevation.ts` như module frontend → esbuild crash
 * ("Invalid loader value"). Đăng ký middleware NÀY trước để chặn request trước khi Vite
 * cố transform file thật.
 */
function devElevationProxy() {
  return {
    name: 'dev-elevation-proxy',
    configureServer(server: { middlewares: { use: (path: string, handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void) => void } }) {
      server.middlewares.use('/api/elevation', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const locations = url.searchParams.get('locations');
        if (!locations) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'missing locations param' }));
          return;
        }
        try {
          const upstream = await fetch(
            `https://api.opentopodata.org/v1/srtm30m?locations=${encodeURIComponent(locations)}`,
          );
          const body = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(body);
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'upstream fetch failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyLibreDwgWasm(), devElevationProxy()],
  // Inject version từ package.json vào build (header app hiện badge)
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  worker: {
    format: 'es',
  },
  // Cho phép WASM từ @mlightcad/libredwg-web được serve đúng MIME type
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@mlightcad/libredwg-web'],
  },
  server: {
    port: 5173,
    open: true,
    headers: {
      // Required cho SharedArrayBuffer / WASM threading (nếu lib dùng)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
