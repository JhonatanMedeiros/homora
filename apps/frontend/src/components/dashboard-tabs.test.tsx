// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DashboardTabs } from './dashboard-tabs';

afterEach(cleanup);

function show(alertCount?: number) {
  const handlers = {
    onHome: vi.fn(),
    onSearch: vi.fn(),
    onAlerts: vi.fn(),
    onManage: vi.fn(),
  };
  render(<DashboardTabs {...handlers} alertCount={alertCount} />);
  return handlers;
}

it('marks Home as current and keeps a name on every item', () => {
  show();
  expect(screen.getByRole('button', { name: 'Início' }).getAttribute('aria-current')).toBe('page');
  for (const name of ['Buscar', 'Alertas', 'Gerenciar'])
    expect(screen.getByRole('button', { name }).getAttribute('aria-current')).toBeNull();
});

it('shows the name only on the active item and calls the handlers', () => {
  const handlers = show();
  expect(screen.getByText('Início').className).not.toContain('sr-only');
  expect(screen.getByText('Buscar').className).toContain('sr-only');
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Alertas' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gerenciar' }));
  expect(handlers.onSearch).toHaveBeenCalled();
  expect(handlers.onAlerts).toHaveBeenCalled();
  expect(handlers.onManage).toHaveBeenCalled();
});

it('shows the count of open alerts over the bell, and nothing when there are none', () => {
  show(3);
  expect(screen.getByText('3')).toBeTruthy();
  cleanup();
  show(0);
  expect(screen.queryByText('0')).toBeNull();
});
