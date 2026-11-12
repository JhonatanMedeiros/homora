// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PageTabs } from './page-tabs';
import { setLocale } from '@/i18n';

const pages = [
  { id: 1, name: 'Home', position: 0, groups: 1 },
  { id: 2, name: 'Media', position: 1, groups: 1 },
];
beforeEach(() => setLocale('en'));
afterEach(cleanup);

it('shows the pages as tabs with counters and the number that are down', () => {
  render(
    <PageTabs
      pages={pages}
      activeId={1}
      onSelect={() => {}}
      counts={(id) => (id === 1 ? { total: 3, down: 0 } : { total: 5, down: 2 })}
    />,
  );
  expect(screen.getByRole('tablist', { name: 'Pages' })).toBeTruthy();
  const home = screen.getByRole('tab', { name: /Home/ });
  expect(home.getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tab', { name: /Media/ }).textContent).toContain('2 down');
  expect(home.textContent).not.toContain('down');
});

it('selects a page when its tab is activated', () => {
  const onSelect = vi.fn();
  render(
    <PageTabs
      pages={pages}
      activeId={1}
      onSelect={onSelect}
      counts={() => ({ total: 0, down: 0 })}
    />,
  );
  const media = screen.getByRole('tab', { name: /Media/ });
  fireEvent.mouseDown(media);
  fireEvent.focus(media);
  fireEvent.keyDown(media, { key: 'Enter' });
  fireEvent.click(media);
  expect(onSelect).toHaveBeenCalledWith(2);
});
