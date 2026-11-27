import type { MessageKey } from '@/i18n';
import type { Tab } from '@/components/app-nav';

/** How long the second key of a `g` chord may take. */
export const CHORD_TIMEOUT_MS = 1000;

export type ShortcutAction =
  | { type: 'palette' }
  | { type: 'help' }
  | { type: 'go'; tab: Exclude<Tab, 'account'> }
  | { type: 'problems' }
  | { type: 'newService' }
  | { type: 'page'; index: number };

export type Shortcut = {
  /** Keys as shown to the person, in order. */
  keys: string[];
  label: MessageKey;
  /** True for the shortcuts that use Ctrl/Cmd and so stay on when single keys are off. */
  modifier?: boolean;
  action?: ShortcutAction;
};

/** The single source for the shortcut list, the help dialog and the key handler. */
export const SHORTCUTS: Shortcut[] = [
  { keys: ['/'], label: 'shortcuts.palette', action: { type: 'palette' } },
  { keys: ['?'], label: 'shortcuts.help', action: { type: 'help' } },
  { keys: ['g', 'h'], label: 'shortcuts.goHome', action: { type: 'go', tab: 'home' } },
  {
    keys: ['g', 'i'],
    label: 'shortcuts.goIntegrations',
    action: { type: 'go', tab: 'integrations' },
  },
  { keys: ['g', 'p'], label: 'shortcuts.goProblems', action: { type: 'problems' } },
  { keys: ['g', 'a'], label: 'shortcuts.goAgents', action: { type: 'go', tab: 'agents' } },
  { keys: ['g', 't'], label: 'shortcuts.goActivity', action: { type: 'go', tab: 'activity' } },
  { keys: ['g', 's'], label: 'shortcuts.goSettings', action: { type: 'go', tab: 'settings' } },
  { keys: ['n'], label: 'shortcuts.newService', action: { type: 'newService' } },
  { keys: ['1–9'], label: 'shortcuts.pages' },
  { keys: ['Ctrl/⌘', 'K'], label: 'shortcuts.paletteToggle', modifier: true },
  { keys: ['Ctrl/⌘', 'B'], label: 'shortcuts.sidebar', modifier: true },
];

/** Chord shortcuts by their second key (all of them start with `g`). */
export const CHORDS = new Map(
  SHORTCUTS.filter((item) => item.keys.length === 2 && item.keys[0] === 'g').map((item) => [
    item.keys[1],
    item.action,
  ]),
);
export const SINGLE_KEYS = new Map(
  SHORTCUTS.filter((item) => item.keys.length === 1).map((item) => [item.keys[0], item.action]),
);

/** The keys of the `g` shortcut that goes to a section, for hints (for example `g i`). */
export const chordFor = (tab: Tab) =>
  SHORTCUTS.find((item) => item.action?.type === 'go' && item.action.tab === tab)?.keys;

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);
export const isModifierKey = (key: string) => MODIFIER_KEYS.has(key);

const TYPING =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]';
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"]';

/** True when a single-key shortcut must not fire for this event. */
export function shouldIgnoreSingleKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.repeat) return true;
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(TYPING)) return true;
  // Any open dialog, sheet, menu or the palette: its own keys win, wherever the focus is.
  return Boolean(document.querySelector(OVERLAY));
}

/** The page index (0 based) a digit key switches to on Home, or null for any other key. */
export const pageIndexForKey = (key: string): number | null =>
  /^[1-9]$/.test(key) ? Number(key) - 1 : null;
