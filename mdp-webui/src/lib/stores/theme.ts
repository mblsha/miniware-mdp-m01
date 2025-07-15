import { writable, derived, type Readable } from 'svelte/store';

// Type definitions
type Theme = 'light' | 'dark';

interface ThemeStore extends Readable<Theme> {
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  init: () => void;
}

// Check if we're in the browser
const isBrowser = typeof window !== 'undefined';

// Create the theme store
function createThemeStore(): ThemeStore {
  const STORAGE_KEY = 'mdp:theme';
  
  // Initialize with saved theme or system preference
  const initial: Theme = isBrowser ? (
    (localStorage.getItem(STORAGE_KEY) as Theme) || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  ) : 'dark';
  
  const { subscribe, set, update } = writable(initial);
  
  return {
    subscribe,
    
    // Set theme and persist to localStorage
    setTheme(theme: Theme) {
      if (isBrowser) {
        localStorage.setItem(STORAGE_KEY, theme);
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
      }
      set(theme);
    },
    
    // Toggle between light and dark
    toggle() {
      update(t => {
        const newTheme = t === 'light' ? 'dark' : 'light';
        if (isBrowser) {
          localStorage.setItem(STORAGE_KEY, newTheme);
          document.documentElement.classList.remove('light', 'dark');
          document.documentElement.classList.add(newTheme);
        }
        return newTheme;
      });
    },
    
    // Initialize theme on app start
    init() {
      if (isBrowser) {
        const savedTheme = localStorage.getItem(STORAGE_KEY) as Theme;
        const theme: Theme = savedTheme || (
          window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        );
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
        set(theme);
      }
    }
  };
}

export const theme: ThemeStore = createThemeStore();

// Derived store for theme-specific values
export const isDark: Readable<boolean> = derived(theme, ($theme: Theme) => $theme === 'dark');
