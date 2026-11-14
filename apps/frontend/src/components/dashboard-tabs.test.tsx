// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DashboardTabs } from './dashboard-tabs';

afterEach(cleanup);

it('has four actions that each call their handler', () => {
  const handlers = { onHome: vi.fn(), onSearch: vi.fn(), onAlerts: vi.fn(), onManage: vi.fn() };
  render(<DashboardTabs {...handlers} />);
  expect(screen.getAllByRole('button')).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Alertas' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gerenciar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Início' }));
  for (const handler of Object.values(handlers)) expect(handler).toHaveBeenCalledOnce();
});
