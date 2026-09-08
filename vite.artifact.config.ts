import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const root = process.cwd();
const stub = path.resolve(root, 'scripts/preview-stubs/unavailable.ts');

/**
 * Build variant for the hosted single-file preview.
 *
 * Everything has to end up in one HTML file, so code-splitting is off and the
 * libraries whose features the sandbox cannot support are aliased away rather
 * than bundled and left unreachable.
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  define: { 'import.meta.env.VITE_SINGLE_FILE': JSON.stringify('1') },
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      // Exports stay real: the host's downloads capability carries the file to
      // the viewer. Only the OCR runtime cannot be served from a single file.
      'tesseract.js': stub,
    },
  },
  build: {
    outDir: 'dist-artifact',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
