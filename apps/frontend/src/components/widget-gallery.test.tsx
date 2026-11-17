// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { WidgetGallery } from '@/components/widget-gallery';
import { WidgetHost } from '@/components/widget-host';
import { setLocale } from '@/i18n';
import type { Connection } from '@/features/connections/connection-model';

const sampleConnections: Connection[] = [
  {
    id: 7,
    name: 'Proxmox Lab',
    type: 'proxmox',
    url: 'https://pve.local:8006',
    verifyTls: true,
    allowPrivate: false,
    hasToken: true,
    hasSecret: false,
    hasCa: false,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function renderGallery(connections: Connection[] = sampleConnections, onPick = vi.fn()) {
  return {
    onPick,
    ...render(
      <WidgetHost>
        <WidgetGallery connections={connections} onPick={onPick} />
      </WidgetHost>,
    ),
  };
}

beforeEach(() => {
  setLocale('pt-BR');
  window.localStorage.removeItem('homora.recentWidgets');
});

afterEach(() => {
  cleanup();
  window.localStorage.removeItem('homora.recentWidgets');
});

it('filters widgets by category and shows connections only when matching', () => {
  renderGallery();

  expect(screen.getByRole('button', { name: /Relógio/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Proxmox Lab/ })).toBeTruthy();

  const navs = screen.getAllByRole('navigation', { name: 'Categorias de widgets' });
  const monitoringButton = within(navs[0]).getByRole('button', { name: /Monitoramento/ });
  fireEvent.click(monitoringButton);

  expect(screen.queryByRole('button', { name: /Relógio/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Proxmox Lab/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Problemas atuais/ })).toBeTruthy();
});

it('searches across all categories using keywords and description', () => {
  renderGallery();

  const navs = screen.getAllByRole('navigation', { name: 'Categorias de widgets' });
  fireEvent.click(within(navs[0]).getByRole('button', { name: /Monitoramento/ }));

  const search = screen.getByRole('searchbox', { name: 'Buscar widget ou conexão' });
  fireEvent.change(search, { target: { value: 'timezone' } });

  expect(screen.getByRole('button', { name: /Relógio/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Problemas atuais/ })).toBeNull();
});

it('picks a single search match on Enter and clears empty search state', () => {
  const { onPick } = renderGallery();
  const search = screen.getByRole('searchbox', { name: 'Buscar widget ou conexão' });

  fireEvent.change(search, { target: { value: 'atom' } });
  fireEvent.keyDown(search, { key: 'Enter' });

  expect(onPick).toHaveBeenCalledWith(null, 'rss-feed');

  fireEvent.change(search, { target: { value: 'no-such-widget-xyz' } });
  expect(screen.getByText('Nenhum widget corresponde à busca.')).toBeTruthy();

  const clearButtons = screen.getAllByRole('button', { name: 'Limpar busca' });
  fireEvent.click(clearButtons.at(-1));
  expect((search as HTMLInputElement).value).toBe('');
  expect(screen.getByRole('button', { name: /Relógio/ })).toBeTruthy();
});

it('records recent picks and displays the Recent category', () => {
  const { onPick } = renderGallery();

  fireEvent.click(screen.getByRole('button', { name: /Proxmox Lab/ }));
  expect(onPick).toHaveBeenCalledWith(sampleConnections[0], 'proxmox');

  cleanup();
  renderGallery();

  const navs = screen.getAllByRole('navigation', { name: 'Categorias de widgets' });
  const recentTab = within(navs[0]).getByRole('button', { name: /Recentes/ });
  fireEvent.click(recentTab);

  const recentHeading = screen.getByRole('heading', { name: 'Recentes' });
  expect(recentHeading).toBeTruthy();
  const recentSection = recentHeading.closest('section');
  expect(recentSection).toBeTruthy();
  expect(within(recentSection!).getByRole('button', { name: /Proxmox Lab/ })).toBeTruthy();
});
