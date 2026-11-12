// @vitest-environment happy-dom
import type { Service } from '@homora/shared';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CommandPalette } from './command-palette';

beforeAll(() => {
  // cmdk measures and scrolls items; happy-dom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

const svc = (id: number, name: string, category: string): Service =>
  ({ id, name, category, url: `http://${name.toLowerCase()}.lan/`, description: '' }) as Service;

const services = [svc(1, 'Wiki', 'Casa'), svc(2, 'Proxmox', 'Infra'), svc(3, 'Grafana', 'Infra')];

function setup(extra: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    services,
    statuses: {
      1: { status: 'available' as const, lastAttempt: null },
      2: { status: 'unavailable' as const, lastAttempt: null },
    },
    blockedIds: new Set<number>(),
    managing: false,
    onManageChange: vi.fn(),
    onAddService: vi.fn(),
    onToggleTheme: vi.fn(),
    onNavigate: vi.fn(),
    onGoToCard: vi.fn(),
    view: 'list' as const,
    onViewChange: vi.fn(),
    showDescriptions: true,
    onShowDescriptionsChange: vi.fn(),
    ...extra,
  };
  render(<CommandPalette {...props} />);
  return props;
}

const type = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('Buscar serviços ou executar um comando'), {
    target: { value },
  });

it('status:down lists only the unavailable services and hides commands', () => {
  setup();
  type('status:down');
  expect(screen.getByText('Proxmox')).toBeTruthy();
  expect(screen.queryByText('Wiki')).toBeNull();
  expect(screen.queryByText('Grafana')).toBeNull();
  expect(screen.queryByText('Alternar tema')).toBeNull();
});

it('filters by group and by the host in the text part', () => {
  setup();
  type('grupo:Infra graf');
  expect(screen.getByText('Grafana')).toBeTruthy();
  expect(screen.queryByText('Proxmox')).toBeNull();
  type('proxmox.lan');
  expect(screen.getByText('Proxmox')).toBeTruthy();
});

it('navigates to a section and closes without writing anything', () => {
  const props = setup();
  fireEvent.click(screen.getByText('Importar / Exportar'));
  expect(props.onNavigate).toHaveBeenCalledWith('/manage/settings/backup');
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
  fireEvent.click(screen.getByText('Agentes'));
  expect(props.onNavigate).toHaveBeenCalledWith('/manage/agents');
});

it('opens the service in a new tab and remembers it once, newest first', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  setup();
  fireEvent.click(screen.getByText('Wiki'));
  expect(open).toHaveBeenCalledWith('http://wiki.lan/', '_blank', 'noopener,noreferrer');
  fireEvent.click(screen.getByText('Proxmox'));
  fireEvent.click(screen.getAllByText('Wiki')[0]);
  expect(JSON.parse(localStorage.getItem('homora-recent-services') ?? '[]')).toEqual([1, 2]);
});

it('shows recents on top while the search is empty and hides them while typing', () => {
  localStorage.setItem('homora-recent-services', '[3,99]');
  setup();
  const recent = screen.getByText('Recentes').closest('[cmdk-group]') as HTMLElement;
  expect(within(recent).getByText('Grafana')).toBeTruthy();
  expect(within(recent).queryByText('99')).toBeNull();
  type('graf');
  expect(screen.queryByText('Recentes')).toBeNull();
});

it('goes to the card from the row button without opening the service', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const props = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Ir para o card de Wiki' }));
  expect(props.onGoToCard).toHaveBeenCalledWith(services[0]);
  expect(open).not.toHaveBeenCalled();
});

it('goes to the card with Shift+Enter on the highlighted service', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const props = setup();
  type('wiki');
  fireEvent.keyDown(screen.getByPlaceholderText('Buscar serviços ou executar um comando'), {
    key: 'Enter',
    shiftKey: true,
  });
  expect(props.onGoToCard).toHaveBeenCalledWith(services[0]);
  expect(open).not.toHaveBeenCalled();
});

it('sorts with unavailable services first', () => {
  setup();
  fireEvent.click(screen.getByRole('radio', { name: 'Status' }));
  const names = screen
    .getAllByRole('option')
    .map((option) => option.textContent ?? '')
    .filter((text) => /Wiki|Proxmox|Grafana/.test(text));
  expect(names[0]).toContain('Proxmox');
});
