import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  optimizeDeps: {
    exclude: ['kaitai-struct']
  },
  build: {
    rollupOptions: {
      external: ['iconv-lite']
    }
  }
})
