import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages'te site /<repo-adi>/ altında yayınlanır.
// Workflow bu değeri BASE_PATH ile verir; yerelde '/' kullanılır.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1000 },
})
