import { writable, derived } from 'svelte/store';

// Check if we're in the browser
const isBrowser = typeof window !== 'undefined';

// Create the theme store
function createThemeStore() {
  const STORAGE_KEY = 'mdp:theme';
  
  // Initialize with saved theme or system preference
  const initial = isBrowser ? (
    localStorage.getItem(STORAGE_KEY) || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  ) : 'dark';
  
  const { subscribe, set, update } = writable(initial);

  const applyThemeToDocument = (theme: string): void => {
    if (!isBrowser) return;

    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  };
  
  return {
    subscribe,
    
    // Set theme and persist to localStorage
    setTheme(theme: string): void {
      applyThemeToDocument(theme);
      set(theme);
    },

    // Toggle between light and dark
    toggle(): void {
      update(t => {
        const newTheme = t === 'light' ? 'dark' : 'light';
        applyThemeToDocument(newTheme);
        return newTheme;
      });
    },

    // Initialize theme on app start
    init(): void {
      if (isBrowser) {
        const savedTheme = localStorage.getItem(STORAGE_KEY);
        const theme = savedTheme || (
          window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        );
        applyThemeToDocument(theme);
        set(theme);
      }
    }
  };
}

export const theme = createThemeStore();

// Derived store for theme-specific values
export const isDark = derived(theme, $theme => $theme === 'dark');
