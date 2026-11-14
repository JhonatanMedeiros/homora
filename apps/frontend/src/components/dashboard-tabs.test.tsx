// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DashboardTabs } from './dashboard-tabs';
import { setLocale } from '@/i18n';

beforeEach(() => setLocale('pt-BR'));
afterEach(cleanup);

function show() {
  const handlers = {
    onHome: vi.fn(),
    onSearch: vi.fn(),
    onManage: vi.fn(),
  };
  render(<DashboardTabs {...handlers} />);
  return handlers;
}

it('marks Home as current and keeps a name on every item', () => {
  show();
  expect(screen.getByRole('button', { name: 'Início' }).getAttribute('aria-current')).toBe('page');
  for (const name of ['Buscar', 'Gerenciar'])
    expect(screen.getByRole('button', { name }).getAttribute('aria-current')).toBeNull();
});

it('shows the name only on the active item and calls the handlers', () => {
  const handlers = show();
  expect(screen.getByText('Início').className).not.toContain('sr-only');
  expect(screen.getByText('Buscar').className).toContain('sr-only');
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gerenciar' }));
  expect(handlers.onSearch).toHaveBeenCalled();
  expect(handlers.onManage).toHaveBeenCalled();
});

it('has no notifications item: the bell lives in the header', () => {
  show();
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: /Alertas|Notificações/ })).toBeNull();
});
