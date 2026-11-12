// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { setLocale } from '@/i18n';
import { SettingsSearch } from './settings-search';

beforeEach(() => setLocale('en'));
afterEach(cleanup);

const renderSearch = () =>
  render(
    <MemoryRouter>
      <SettingsSearch />
    </MemoryRouter>,
  );

it('lists nothing until you type, then links to the tab that holds the setting', () => {
  renderSearch();
  expect(screen.queryByRole('link')).toBeNull();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
    target: { value: 'time zone' },
  });
  const link = screen.getByRole('link', { name: /Time zone/ });
  expect(link.getAttribute('href')).toBe('/manage/settings/topbar');
});

it('ignores accents and case, and says when nothing matches', () => {
  setLocale('pt-BR');
  renderSearch();
  const field = screen.getByRole('searchbox');
  fireEvent.change(field, { target: { value: 'DESCRICOES' } });
  expect(screen.queryByText('Nenhuma configuração encontrada.')).toBeNull();
  fireEvent.change(field, { target: { value: 'zzzz' } });
  expect(screen.getByText('Nenhuma configuração encontrada.')).toBeTruthy();
});
