import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const SLOT_ID = 'home-status-slot';
const noSubscription = () => () => undefined;
const findSlot = () => document.getElementById(SLOT_ID);

/** An empty place in the app header, where the Home puts its status pill. */
export function HeaderStatusSlot() {
  return <div id={SLOT_ID} className="contents" />;
}

/** Renders `children` in the header slot; nothing when the page has no header (tests, embeds). */
export function HeaderStatusPortal({ children }: { children: ReactNode }) {
  // The slot is in the header, which commits in the same pass as this page: read it after that.
  const slot = useSyncExternalStore(noSubscription, findSlot, () => null);
  return slot ? createPortal(children, slot) : null;
}
