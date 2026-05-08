import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
