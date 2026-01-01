import { resolve } from 'path';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

const resolvePath = (target) => resolve(__dirname, target);

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{js,ts,svelte}'],
      exclude: ['src/lib/kaitai/**'],
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  resolve: {
    conditions: ['browser'],
    alias: [
      { find: '$lib', replacement: '/src/lib' },
      {
        find: '@mdp-core/protocol/kaitai-wrapper',
        replacement: resolvePath('../packages/mdp-core/src/protocol/kaitai-wrapper.browser.ts')
      },
      { find: '@mdp-core/protocol', replacement: resolvePath('../packages/mdp-core/src/protocol') },
      { find: '@mdp-core/util/signal', replacement: resolvePath('../packages/mdp-core/src/util/signal.ts') },
      { find: '@mdp-core/services/packet-bus', replacement: resolvePath('../packages/mdp-core/src/services/packet-bus.ts') },
      {
        find: '@mdp-core/stores/timeseries-store',
        replacement: resolvePath('../packages/mdp-core/src/stores/timeseries-store.ts')
      },
      {
        find: '@mdp-core/stores/timeseries-integration',
        replacement: resolvePath('../packages/mdp-core/src/stores/timeseries-integration.ts')
      },
      {
        find: '@mdp-core/stores/sparkline-store',
        replacement: resolvePath('../packages/mdp-core/src/stores/sparkline-store.ts')
      },
      { find: '@mdp-core/transport', replacement: resolvePath('../packages/mdp-core/src/transport') },
      { find: /^kaitai-struct(\/.*)?$/, replacement: resolvePath('./node_modules/kaitai-struct$1') }
    ]
  }
});
