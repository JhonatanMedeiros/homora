import { useEffect, useRef } from 'react';
import type { Tab } from '@/components/app-nav';
import {
  CHORD_TIMEOUT_MS,
  CHORDS,
  SINGLE_KEYS,
  isModifierKey,
  pageIndexForKey,
  shouldIgnoreSingleKey,
  type ShortcutAction,
} from '@/lib/shortcuts';

type Handlers = {
  /** Single-key shortcuts (everything except Ctrl/Cmd+K) run only when true. */
  enabled: boolean;
  /** `n` only makes sense where a service can be created. */
  canCreateService: boolean;
  onTogglePalette: () => void;
  onOpenPalette: () => void;
  onOpenHelp: () => void;
  onGo: (tab: Exclude<Tab, 'account'>) => void;
  onNewService: () => void;
  /** Digits switch pages on Home; return true when the key was used so it is not passed on. */
  onGoPage?: (index: number) => boolean;
};

/**
 * The one global keyboard listener of the authenticated shell: Ctrl/Cmd+K always, plus the
 * single-key shortcuts (`/`, `?`, `g` chords, `n`) unless the person turned them off.
 */
export function useShortcuts(handlers: Handlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    let chord: ReturnType<typeof setTimeout> | null = null;
    const cancelChord = () => {
      if (chord) clearTimeout(chord);
      chord = null;
    };
    const run = (action: ShortcutAction | undefined, event: KeyboardEvent) => {
      const current = latest.current;
      if (!action) return;
      if (action.type === 'newService' && !current.canCreateService) return;
      event.preventDefault();
      if (action.type === 'palette') current.onOpenPalette();
      else if (action.type === 'help') current.onOpenHelp();
      else if (action.type === 'go') current.onGo(action.tab);
      else current.onNewService();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        cancelChord();
        event.preventDefault();
        latest.current.onTogglePalette();
        return;
      }
      if (isModifierKey(event.key)) return;
      const pending = chord !== null;
      cancelChord();
      if (!latest.current.enabled || shouldIgnoreSingleKey(event)) return;
      if (pending) {
        // Any key finishes the chord: a known second key runs it, anything else cancels it.
        run(CHORDS.get(event.key), event);
        return;
      }
      if (event.key === 'g') {
        chord = setTimeout(cancelChord, CHORD_TIMEOUT_MS);
        return;
      }
      const pageIndex = pageIndexForKey(event.key);
      if (pageIndex !== null) {
        if (latest.current.onGoPage?.(pageIndex)) event.preventDefault();
        return;
      }
      run(SINGLE_KEYS.get(event.key), event);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelChord();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
