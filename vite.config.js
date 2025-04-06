import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      util: 'util/',
      'readable-stream': 'readable-stream/',
    },
  },
  optimizeDeps: {
    include: ['simple-peer', 'readable-stream', 'util'],
    exclude: ['@types/node'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
        secure: false
      }
    },
  },
}); 