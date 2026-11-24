// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PageListDialog } from './page-list-dialog';
import { setLocale } from '@/i18n';

function makePages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Page ${index + 1}`,
    position: index,
    groups: 0,
  }));
}

beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  setLocale('pt-BR');
  vi.unstubAllGlobals();
});

it('lists every page with its counters, marks the current one, and selects on click', () => {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <PageListDialog
      open
      onOpenChange={onOpenChange}
      pages={makePages(3)}
      activeId={1}
      counts={(id) => ({ total: id * 2, down: id === 2 ? 1 : 0 })}
      onSelect={onSelect}
    />,
  );
  expect(screen.getByRole('dialog', { name: 'All pages' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Page 1/ }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('button', { name: /Page 2/ }).textContent).toContain('1 down');
  fireEvent.click(screen.getByRole('button', { name: /Page 3/ }));
  expect(onSelect).toHaveBeenCalledWith(3);
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('only offers search with many pages, and filters by name', () => {
  const { rerender } = render(
    <PageListDialog
      open
      onOpenChange={() => {}}
      pages={makePages(4)}
      activeId={1}
      counts={() => ({ total: 0, down: 0 })}
      onSelect={() => {}}
    />,
  );
  expect(screen.queryByLabelText('Search pages')).toBeNull();

  rerender(
    <PageListDialog
      open
      onOpenChange={() => {}}
      pages={makePages(8)}
      activeId={1}
      counts={() => ({ total: 0, down: 0 })}
      onSelect={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'page 7' } });
  expect(screen.getByRole('button', { name: /Page 7/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Page 2/ })).toBeNull();
  fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'zzz' } });
  expect(screen.getByRole('status').textContent).toContain('No page matches');
});

it('offers the add button and per-page menus only when pages can be changed', () => {
  const props = {
    open: true,
    onOpenChange: () => {},
    pages: makePages(2),
    activeId: 1,
    counts: () => ({ total: 0, down: 0 }),
    onSelect: () => {},
  };
  const { rerender } = render(<PageListDialog {...props} />);
  expect(screen.queryByRole('button', { name: 'Add page' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Page menu/ })).toBeNull();

  rerender(<PageListDialog {...props} onChanged={() => {}} />);
  expect(screen.getByRole('button', { name: 'Add page' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Page menu: Page 2' })).toBeTruthy();
});
