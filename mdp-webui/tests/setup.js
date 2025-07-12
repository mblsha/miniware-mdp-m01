import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Note: Component mocking is done individually in test files where needed

// Add CSS support for computed styles in tests
// Mock getComputedStyle to return proper CSS values for grid layout
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = vi.fn((element) => {
  const styles = originalGetComputedStyle(element);
  
  // Check if element has grid-related classes or styles
  if (element.classList?.contains('channel-grid') || 
      element.className?.includes('channel-grid')) {
    return {
      ...styles,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    };
  }
  
  return styles;
});

// Mock Web Serial API globally
global.navigator.serial = {
  requestPort: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Mock for ResizeObserver (needed for uPlot)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock for requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 0));
global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

// Mock for matchMedia (needed by uPlot)
global.matchMedia = vi.fn((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));