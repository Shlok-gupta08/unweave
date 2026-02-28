import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0', // Important for Docker
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/gpu-api': {
        target: process.env.VITE_GPU_BACKEND_URL || 'https://8000-01kj235bjnpdxvnr8x7k0x2mhq.cloudspaces.litng.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/gpu-api/, '')
      },
      '/stems': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  }
})
