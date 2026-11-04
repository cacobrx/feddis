import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// La compilación se publica en /eddisfac2/app y la API vive en /eddisfac2/api.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: '../app', emptyOutDir: true },
  server: {
    proxy: { '/eddisfac2/api': { target: 'http://localhost', changeOrigin: false } },
  },
})
