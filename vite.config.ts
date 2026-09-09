import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { buildStamp } from './scripts/build-stamp';

export default defineConfig({
  plugins: [react(), buildStamp()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1400,
  },
});
