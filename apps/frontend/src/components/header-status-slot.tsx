import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// The slot is a plain element in the header; the Home learns when it appears or goes away.
let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const current = () => slot;
const setSlot = (node: HTMLElement | null) => {
  if (node === slot) return;
  slot = node;
  listeners.forEach((listener) => listener());
};

/** An empty place in the app header, where the Home puts its status pill. */
export function HeaderStatusSlot() {
  return <div ref={setSlot} className="contents" />;
}

/** Renders `children` in the header slot; nothing when the page has no header (tests, embeds). */
export function HeaderStatusPortal({ children }: { children: ReactNode }) {
  const target = useSyncExternalStore(subscribe, current, () => null);
  return target ? createPortal(children, target) : null;
}
