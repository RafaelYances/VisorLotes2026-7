import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // En GitHub Pages el sitio vive en /<repositorio>/ (lo define el workflow con BASE_PATH)
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  // En desarrollo, /api/* se envía al servidor local de Cloudflare (npm run dev:api)
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: { maplibre: ['maplibre-gl'], react: ['react', 'react-dom', 'react-router'], motion: ['motion'] },
      },
    },
  },
});
