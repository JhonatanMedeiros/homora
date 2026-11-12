// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { setLocale } from '@/i18n';
import { SHORTCUTS } from '@/lib/shortcuts';
import { ShortcutsDialog } from './shortcuts-dialog';

beforeEach(() => setLocale('en'));
afterEach(cleanup);

function Host({ enabled = true }: { enabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <ShortcutsDialog open={open} onOpenChange={setOpen} singleKeysEnabled={enabled} />
    </>
  );
}

it('lists every shortcut, closes with Escape', () => {
  render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: 'opener' }));
  const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
  expect(dialog.querySelectorAll('li')).toHaveLength(SHORTCUTS.length);
  expect(dialog.textContent).toContain('Ctrl/⌘');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('says when the single keys are off', () => {
  render(<Host enabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'opener' }));
  expect(screen.getByText(/turned off in Settings/)).toBeTruthy();
});
