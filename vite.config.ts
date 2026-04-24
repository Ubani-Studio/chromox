import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
