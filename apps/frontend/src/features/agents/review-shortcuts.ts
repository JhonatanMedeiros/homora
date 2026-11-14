/**
 * Whether a key press may drive the review shortcuts: not while typing, not with a modifier,
 * and not while a dialog or sheet owns the keyboard.
 */
export function shortcutAllowed(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (target instanceof HTMLElement) {
    if (target.isContentEditable || target.closest('input, textarea, select')) return false;
  }
  return !document.querySelector('[role="dialog"], [role="alertdialog"]');
}
