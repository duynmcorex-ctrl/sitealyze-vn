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

export default defineConfig({
  plugins: [react(), copyLibreDwgWasm()],
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
