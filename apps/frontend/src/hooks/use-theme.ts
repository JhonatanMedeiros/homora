import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'homora-theme';

function systemTheme(): Theme {
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function currentTheme(): Theme {
  const root = document.documentElement;
  if (root.classList.contains('dark')) return 'dark';
  if (root.dataset.theme === 'light') return 'light';
  return systemTheme();
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/** Aplica o tema salvo (ou o do sistema) antes da primeira renderização. */
export function initTheme() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Sem armazenamento disponível: segue o tema do sistema.
  }
  apply(saved === 'light' || saved === 'dark' ? saved : systemTheme());
}

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'dark' as Theme);
  const setTheme = useCallback((next: Theme) => {
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A escolha vale só nesta página.
    }
    listeners.forEach((listener) => listener());
  }, []);
  const toggleTheme = useCallback(
    () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'),
    [setTheme],
  );
  return { theme, setTheme, toggleTheme };
}
