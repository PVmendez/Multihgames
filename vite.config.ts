import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, `npm run dev:worker` levanta el Worker en :8787 y Vite le pasa /api (incluido el WebSocket).
export default defineConfig({
  plugins: [react()],
  root: '.',
  server: {
    host: true,
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } }
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 }
});
