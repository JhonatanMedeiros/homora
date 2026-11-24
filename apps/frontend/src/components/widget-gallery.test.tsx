// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { WidgetGallery } from '@/components/widget-gallery';
import { listWidgetUI } from '@/components/widget-ui-registry';
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

  const nav = screen.getByRole('navigation', { name: 'Categorias de widgets' });
  const monitoringButton = within(nav).getByRole('button', { name: /Monitoramento/ });
  fireEvent.click(monitoringButton);

  expect(screen.queryByRole('button', { name: /Relógio/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Proxmox Lab/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Problemas atuais/ })).toBeTruthy();
});

it('searches across all categories using keywords and description', () => {
  renderGallery();

  const nav = screen.getByRole('navigation', { name: 'Categorias de widgets' });
  fireEvent.click(within(nav).getByRole('button', { name: /Monitoramento/ }));

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
  const clearButton = clearButtons.at(-1);
  expect(clearButton).toBeTruthy();
  fireEvent.click(clearButton!);
  expect((search as HTMLInputElement).value).toBe('');
  expect(screen.getByRole('button', { name: /Relógio/ })).toBeTruthy();
});

it('records recent picks and displays the Recent category', () => {
  const { onPick } = renderGallery();

  fireEvent.click(screen.getByRole('button', { name: /Proxmox Lab/ }));
  expect(onPick).toHaveBeenCalledWith(sampleConnections[0], 'proxmox');

  cleanup();
  renderGallery();

  const nav = screen.getByRole('navigation', { name: 'Categorias de widgets' });
  const recentTab = within(nav).getByRole('button', { name: /Recentes/ });
  fireEvent.click(recentTab);

  const recentHeading = screen.getByRole('heading', { name: 'Recentes' });
  expect(recentHeading).toBeTruthy();
  const recentSection = recentHeading.closest('section');
  expect(recentSection).toBeTruthy();
  expect(within(recentSection!).getByRole('button', { name: /Proxmox Lab/ })).toBeTruthy();
});

it('renders every widget gallery icon as an SVG, never text or a live widget', () => {
  for (const [type, entry] of listWidgetUI()) {
    const Gallery = entry.Gallery;
    const { container, unmount } = render(
      <WidgetHost>
        <Gallery />
      </WidgetHost>,
    );
    expect(container.querySelector('svg'), `${type} gallery icon`).toBeTruthy();
    expect(container.textContent?.trim(), `${type} gallery text`).toBe('');
    unmount();
  }
});

it('describes a connection by its service and highlights the search term', () => {
  renderGallery();

  expect(screen.getByRole('button', { name: /Proxmox VE · dados ao vivo/ })).toBeTruthy();

  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'relóg' } });
  // The highlight splits the title across nodes, so find the card by its text.
  const clock = screen
    .getAllByRole('button')
    .find((button) => button.textContent?.includes('Relógio'))!;
  expect(clock.querySelector('mark')?.textContent?.toLowerCase()).toBe('relóg');
  expect(within(clock).getByText('Tempo e agenda')).toBeTruthy();
});
