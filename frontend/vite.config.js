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
      '/ws': {
        target: 'ws://localhost:3002',
        ws: true,
        changeOrigin: true,
        secure: false
      },
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true,
        changeOrigin: true,
        secure: false
      },
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false
      }
    }
  },
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      'stream': 'stream-browserify',
      'buffer': 'buffer',
      'util': 'util/'
    }
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
  optimizeDeps: {
    esbuildOptions: {
      // Настраиваем esbuild для корректной обработки модуля util
      define: {
        global: 'globalThis'
      },
      plugins: [
        {
          name: 'fix-util',
          setup(build) {
            // Создаем пустые заглушки для проблемных методов
            build.onResolve({ filter: /util\/debuglog/ }, () => {
              return { path: 'util/debuglog-shim.js' };
            });
            build.onLoad({ filter: /util\/debuglog-shim\.js$/ }, () => {
              return { contents: 'export default function debuglog() { return function() {}; }' };
            });
            build.onResolve({ filter: /util\/inspect/ }, () => {
              return { path: 'util/inspect-shim.js' };
            });
            build.onLoad({ filter: /util\/inspect-shim\.js$/ }, () => {
              return { contents: 'export default function inspect(obj) { return String(obj); }' };
            });
          }
        }
      ]
    }
  },
  define: {
    global: 'globalThis',
  }
}) 