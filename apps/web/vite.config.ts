import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // The API runs separately in development (apps/api, port 3000).
    proxy: { '/api': 'http://localhost:3000' },
  },
  preview: { port: 4173, strictPort: true },
})
