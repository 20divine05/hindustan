import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    proxy: {
      '/api/gstin': {
        target: 'https://www.gstinapi.in',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost');
          const gstin = url.searchParams.get('gstin');
          return `/v1/gstin/${gstin}`;
        },
        headers: {
          'x-api-key': 'gak_d8708a67ae8f44ca9b09f11d602c9041'
        }
      }
    }
  }
})
