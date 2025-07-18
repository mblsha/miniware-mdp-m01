import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: resolve('./src/lib')
    }
  },
  optimizeDeps: {
    exclude: ['kaitai-struct']
  },
  build: {
    rollupOptions: {
      external: ['iconv-lite']
    }
  }
})
