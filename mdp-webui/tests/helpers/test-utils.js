import { render as originalRender } from '@testing-library/svelte';

// Custom render function that works with Svelte 5
export function render(Component, options = {}) {
  return originalRender(Component, {
    ...options,
  });
}

export * from '@testing-library/svelte';