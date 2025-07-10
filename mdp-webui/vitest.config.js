import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({
    compilerOptions: {
      hydratable: false,
      generate: 'client'
    }
  })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{js,svelte}'],
      exclude: ['src/lib/kaitai/**'],
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  resolve: {
    alias: {
      '$lib': '/src/lib'
    }
  }
});