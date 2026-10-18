import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Development only: the local PaddleOCR bridge (scripts/ocr-bridge.ts). Not part of any build.
  server: {
    proxy: { '/local-ocr': { target: 'http://127.0.0.1:8766', rewrite: (path) => path.replace(/^\/local-ocr/, '') } },
  },
})
