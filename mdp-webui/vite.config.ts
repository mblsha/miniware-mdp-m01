import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: [
      { find: '$lib', replacement: resolve('./src/lib') },
      {
        find: '@mdp-core/protocol/kaitai-wrapper',
        replacement: resolve('../packages/mdp-core/src/protocol/kaitai-wrapper.browser.ts')
      },
      {
        find: /^kaitai-struct(\/.*)?$/,
        replacement: resolve('./node_modules/kaitai-struct$1')
      },
      {
        find: '@mdp-core/protocol',
        replacement: resolve('../packages/mdp-core/src/protocol')
      },
      {
        find: '@mdp-core/util/signal',
        replacement: resolve('../packages/mdp-core/src/util/signal.ts')
      },
      {
        find: '@mdp-core/services/packet-bus',
        replacement: resolve('../packages/mdp-core/src/services/packet-bus.ts')
      },
      {
        find: '@mdp-core/stores/timeseries-store',
        replacement: resolve('../packages/mdp-core/src/stores/timeseries-store.ts')
      },
      {
        find: '@mdp-core/stores/timeseries-integration',
        replacement: resolve('../packages/mdp-core/src/stores/timeseries-integration.ts')
      },
      {
        find: '@mdp-core/stores/sparkline-store',
        replacement: resolve('../packages/mdp-core/src/stores/sparkline-store.ts')
      },
      {
        find: '@mdp-core/transport',
        replacement: resolve('../packages/mdp-core/src/transport')
      }
    ]
  },
  optimizeDeps: {
    include: ['kaitai-struct']
  },
  build: {
    rollupOptions: {
      external: ['iconv-lite']
    }
  }
})
