// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MAX_PAGES } from '@homora/shared';
import { PageTabs } from './page-tabs';
import { setLocale } from '@/i18n';

const pages = [
  { id: 1, name: 'Home', position: 0, groups: 1 },
  { id: 2, name: 'Media', position: 1, groups: 1 },
];
beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  setLocale('pt-BR');
  vi.unstubAllGlobals();
});

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

it('shows the active page menu and add button even with a single page, and creates a page', async () => {
  const created = { id: 3, name: 'Network', position: 1, groups: 0 };
  const calls: [string, RequestInit | undefined][] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (init?.method === 'POST') return new Response(JSON.stringify([pages[0], created]));
      return new Response(JSON.stringify([pages[0]]));
    }),
  );
  const onSelect = vi.fn();
  const onChanged = vi.fn(async () => [pages[0]!, created]);

  render(
    <PageTabs
      pages={[pages[0]!]}
      activeId={1}
      onSelect={onSelect}
      counts={() => ({ total: 2, down: 0 })}
      onChanged={onChanged}
    />,
  );

  expect(screen.getByRole('tab', { name: /Home/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Page menu: Home' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Add page' }));
  const input = await screen.findByLabelText('Page name');
  fireEvent.change(input, { target: { value: 'Network' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  const post = calls.find(([, init]) => init?.method === 'POST');
  expect(post?.[0]).toBe('/api/pages');
  expect(post?.[1]?.body).toBe(JSON.stringify({ name: 'Network' }));
  expect(onSelect).toHaveBeenCalledWith(3);
});

it('hides the add button when the page limit is reached', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify([]))),
  );
  const full = Array.from({ length: MAX_PAGES }, (_, index) => ({
    id: index + 1,
    name: `Page ${index + 1}`,
    position: index,
    groups: 0,
  }));
  render(
    <PageTabs
      pages={full}
      activeId={1}
      onSelect={() => {}}
      counts={() => ({ total: 0, down: 0 })}
      onChanged={() => {}}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Add page' })).toBeNull();
});
