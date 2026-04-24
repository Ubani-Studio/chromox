import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Keep the dep pre-bundle cache OUT of node_modules/.vite - that
  // directory has root-owned stale temp files from a container run
  // and the user can't clear them without sudo. Any user-owned path
  // works here.
  cacheDir: '.vite-cache',
  server: {
    // 5174 was Slayt's port - Mmuo takes 5170, leaving room for other
    // Vite dev servers in the 5171-5179 range.
    port: 5170,
    strictPort: true
  },
  preview: {
    port: 4170,
    strictPort: true
  }
});
