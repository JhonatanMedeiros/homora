// @vitest-environment happy-dom
import type { Service } from '@homora/shared';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { setLocale } from '@/i18n';
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
beforeEach(() => setLocale('pt-BR'));
afterEach(() => {
  cleanup();
  setLocale('en');
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

const searchBox = () => screen.getByPlaceholderText('Buscar serviços ou executar um comando');
const webSearchOn = () => {
  localStorage.setItem('homora-web-search', 'on');
};

it('has no web search item by default, whatever is typed', () => {
  setup();
  type('something else');
  expect(screen.queryByText(/Buscar na web/)).toBeNull();
});

it('offers web search only when enabled and free text is typed', () => {
  webSearchOn();
  setup();
  expect(screen.queryByText(/Buscar na web/)).toBeNull();
  type('status:down group:Infra');
  expect(screen.queryByText(/Buscar na web/)).toBeNull();
  type('quantum cats');
  expect(screen.getByText('Buscar na web por “quantum cats”')).toBeTruthy();
});

it('opens the engine in a new tab with noopener,noreferrer and sends only the typed text', () => {
  webSearchOn();
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const props = setup();
  type('status:down Proxmox lxc');
  fireEvent.click(screen.getByText('Buscar na web por “Proxmox lxc”'));
  expect(open).toHaveBeenCalledExactlyOnceWith(
    'https://duckduckgo.com/?q=Proxmox%20lxc',
    '_blank',
    'noopener,noreferrer',
  );
  const sent = decodeURIComponent(String(open.mock.calls[0][0]));
  for (const leaked of ['status', 'down', 'wiki', 'Infra', 'Casa', 'lan', 'localhost'])
    expect(sent.toLowerCase()).not.toContain(leaked.toLowerCase());
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it('never searches while typing', () => {
  webSearchOn();
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  setup();
  type('typing');
  expect(searchBox()).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('uses a valid custom URL and refuses an invalid one at use time', () => {
  webSearchOn();
  localStorage.setItem('homora-web-search-engine', 'custom');
  localStorage.setItem('homora-web-search-url', 'javascript:alert(%s)');
  setup();
  type('hello');
  expect(screen.queryByText(/Buscar na web/)).toBeNull();
  cleanup();
  localStorage.setItem('homora-web-search-url', 'https://search.example/?q=%s');
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  setup();
  type('hello');
  fireEvent.click(screen.getByText(/Buscar na web/));
  expect(open.mock.calls[0][0]).toBe('https://search.example/?q=hello');
});

it('shows the g hints on the navigation rows only when shortcuts are on', () => {
  setup({ shortcutsEnabled: true });
  const row = screen.getByText('Integrações').closest('[cmdk-item]') as HTMLElement;
  expect(within(row).getByText('g')).toBeTruthy();
  expect(within(row).getByText('i')).toBeTruthy();
  cleanup();
  setup();
  const plain = screen.getByText('Integrações').closest('[cmdk-item]') as HTMLElement;
  expect(within(plain).queryByText('g')).toBeNull();
});

const withLinks: Service[] = [
  {
    ...svc(1, 'Wiki', 'Casa'),
    links: [
      {
        id: 10,
        url: 'http://192.168.1.5:8080/',
        name: '',
        openTarget: null,
        type: { id: 1, name: 'LAN', color: 'green' },
      },
      { id: 11, url: 'https://wiki.lan/admin', name: 'Painel', openTarget: 'same-tab', type: null },
    ],
  },
  svc(2, 'Proxmox', 'Infra'),
];

it('lists the extra addresses under their service only while searching', () => {
  setup({ services: withLinks });
  expect(screen.queryByText('Wiki · LAN')).toBeNull();
  type('wiki');
  expect(screen.getByText('Wiki · LAN')).toBeTruthy();
  expect(screen.getByText('Wiki · Painel')).toBeTruthy();
  // Row order: the service, then its addresses.
  const rows = screen.getAllByRole('option').map((row) => row.textContent ?? '');
  const at = (text: string) => rows.findIndex((row) => row.includes(text));
  expect(at('Wiki · LAN')).toBe(at('wiki.lan') + 1);
  expect(screen.queryByText('Proxmox')).toBeNull();
});

it('finds an extra address by its type or host without the service name', () => {
  setup({ services: withLinks });
  type('192.168.1.5');
  expect(screen.getByText('Wiki · LAN')).toBeTruthy();
  expect(screen.queryByText('Proxmox')).toBeNull();
});

it('opens an extra address the way it is set to open and remembers the service', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  setup({ services: withLinks });
  type('wiki');
  fireEvent.click(screen.getByText('Wiki · LAN'));
  expect(open).toHaveBeenCalledWith('http://192.168.1.5:8080/', '_blank', 'noopener,noreferrer');
  expect(JSON.parse(localStorage.getItem('homora-recent-services') ?? '[]')).toEqual([1]);
});

it('navigates the same tab for an extra address that asks for it', () => {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  setup({ services: withLinks });
  type('wiki');
  fireEvent.click(screen.getByText('Wiki · Painel'));
  expect(assign).toHaveBeenCalledWith('https://wiki.lan/admin');
  vi.unstubAllGlobals();
});
