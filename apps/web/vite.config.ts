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
  build: {
    rolldownOptions: {
      output: {
        // Libraries change far less often than the app. In their own files they stay in the browser cache across
        // deploys (assets/ is served as immutable), so a release only downloads the app code again.
        codeSplitting: {
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'ui', test: /[\\/]node_modules[\\/](@base-ui|@floating-ui)[\\/]/ },
            { name: 'router', test: /[\\/]node_modules[\\/]@tanstack[\\/]/ },
            { name: 'i18n', test: /[\\/]node_modules[\\/](i18next|react-i18next)[\\/]/ },
            { name: 'zod', test: /[\\/]node_modules[\\/]zod[\\/]/ },
          ],
        },
      },
    },
  },
})
