import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/GithubPagesCoonfigTest/',
  server: {
    port: 3000,
    open: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 3000,
      clientPort: 3000
    },
    watch: {
      usePolling: true
    },
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: false,
        changeOrigin: true,
        secure: false
      }
    }
  },
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'socket.io': ['socket.io-client'],
          'react': ['react', 'react-dom'],
          'react-router': ['react-router-dom']
        }
      }
    }
  },
  define: {
    // Полифиллы для Node.js API, необходимые для simple-peer
    global: 'window',
    'process.env': '{}',
    'process.browser': 'true'
  }
}) 