import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { buildStamp } from './scripts/build-stamp';

export default defineConfig({
  plugins: [react(), buildStamp()],
  // Root-absolute, not './'. The hosts all rewrite unknown paths to index.html,
  // so a relative <link rel="manifest"> loaded from any path but "/" resolves to
  // a path that does not exist, gets the app's own HTML back, and fails to parse
  // — which is how an installed app ends up with a generic icon. The same
  // applies to the service worker registration, which would otherwise take the
  // scope of whatever path it was registered from.
  base: '/',
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1400,
  },
});
