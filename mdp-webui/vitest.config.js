import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ 
    hot: !process.env.VITEST,
    compilerOptions: {
      // Disable SSR for tests
      hydratable: false
    }
  })],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{js,svelte}'],
      exclude: ['src/lib/kaitai/**'],
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    // Disable isolation for Svelte 5
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  },
  resolve: {
    alias: {
      '$lib': '/src/lib'
    }
  },
  optimizeDeps: {
    exclude: ['kaitai-struct']
  }
});