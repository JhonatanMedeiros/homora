// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ServicesEmpty } from './services-empty';

afterEach(cleanup);

it('invites the first service on a dashboard that is empty', () => {
  const onAdd = vi.fn();
  render(<ServicesEmpty hasServices={false} onAdd={onAdd} />);
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar primeiro serviço' }));
  expect(onAdd).toHaveBeenCalled();
});

it('offers to clear filters when nothing matches', () => {
  const onClear = vi.fn();
  render(<ServicesEmpty hasServices onAdd={() => {}} onClearFilters={onClear} />);
  expect(screen.getByText('Nenhum serviço encontrado')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
  expect(onClear).toHaveBeenCalled();
});

it('treats an empty Offline view as good news, with a way back', () => {
  const onClear = vi.fn();
  render(<ServicesEmpty hasServices calm onAdd={() => {}} onClearFilters={onClear} />);
  expect(screen.getByText('Nada fora do ar')).toBeTruthy();
  expect(screen.queryByText('Nenhum serviço encontrado')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ver todos os serviços' }));
  expect(onClear).toHaveBeenCalled();
});
