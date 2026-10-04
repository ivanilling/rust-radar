import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// API_TARGET позволяет поднять фронт рядом с бэкендом на нестандартном порту
const apiTarget = process.env.API_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // слушаем и IPv4, и IPv6 (иначе браузер может не попасть на 127.0.0.1)
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
});
