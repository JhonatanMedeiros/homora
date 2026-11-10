import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'homora-top-bar';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

/** Preferência (por navegador) de mostrar a faixa superior. Desligada por padrão. */
export function useTopBar(): [boolean, (value: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((value: boolean) => {
    try {
      localStorage.setItem(KEY, value ? 'on' : 'off');
    } catch {
      // Sem armazenamento: a preferência vale só até recarregar.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [enabled, set];
}
