// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HeaderStatusSlot } from '@/components/header-status-slot';
import { MemoryRouter } from 'react-router';
import { ServicesPage } from './services-page';
import { setLocale } from '@/i18n';
import type { useServices } from '@/hooks/use-services';

type Data = ReturnType<typeof useServices>;
const service = {
  id: 7,
  name: 'NAS',
  url: 'http://192.168.1.10:5000/',
  category: 'Home',
  description: '',
  position: 0,
  allowPrivate: false,
};
const data = {
  services: [service],
  loaded: true,
  groupRows: [{ id: 1, name: 'Home', position: 0 }],
  statuses: {},
  categories: ['Home'],
  pages: [],
  activePageId: 0,
  pageIdOf: () => 0,
  selectPage: () => {},
  sortedIn: () => [service],
  blockedIds: new Set<number>(),
  refresh: async () => {},
} as unknown as Data;

beforeEach(() => {
  setLocale('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/service-defaults'
        ? new Response(JSON.stringify({ allowPrivate: true }))
        : new Response('[]'),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = (formRoute: 'new' | number) =>
  render(
    <MemoryRouter>
      <ServicesPage data={data} formRoute={formRoute} navigate={() => {}} onAddService={() => {}} />
    </MemoryRouter>,
  );
const checkbox = () => screen.getByRole('checkbox', { name: /Allow monitoring on a private/ });

it('starts the checkbox of a new service from the instance setting', async () => {
  open('new');
  await waitFor(() => expect(checkbox().getAttribute('aria-checked')).toBe('true'));
});

it('keeps the stored value when editing a service', async () => {
  open(7);
  await screen.findByRole('form', { name: 'Edit service' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(checkbox().getAttribute('aria-checked')).toBe('false');
});

it('shows probes on the Home at any width and lists a probe that is down in Needs attention', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/probes')
        return new Response(
          JSON.stringify([
            { id: 20, name: 'Internet', checkUrl: 'https://1.1.1.1/', checkType: 'http' },
          ]),
        );
      return new Response('[]');
    }),
  );
  const down = {
    ...data,
    statuses: { 20: { status: 'unavailable', reason: 'no-response', httpStatus: null } },
  } as unknown as Data;
  render(
    <MemoryRouter>
      <HeaderStatusSlot />
      <ServicesPage data={down} formRoute={null} navigate={() => {}} onAddService={() => {}} />
    </MemoryRouter>,
  );
  const section = await screen.findByRole('region', { name: 'Probes' });
  expect(section.textContent).toContain('Internet');
  expect(section.textContent).toContain('Offline');
  // The causes live in the header pill's popover, not on the page.
  fireEvent.click(await screen.findByRole('button', { name: /Health: 1 problem/ }));
  expect(await screen.findByRole('region', { name: 'Needs attention' })).toBeTruthy();
});

it('counts a probe that is down in the health banner and in the Offline view', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/probes'
        ? new Response(
            JSON.stringify([
              { id: 20, name: 'Internet', address: 'https://1.1.1.1', checkType: 'http' },
            ]),
          )
        : new Response('[]'),
    ),
  );
  const down = {
    ...data,
    statuses: {
      7: { status: 'available', reason: 'responding', httpStatus: 200, latencyMs: 20 },
      20: { status: 'unavailable', reason: 'no-response', httpStatus: null },
    },
  } as unknown as Data;
  render(
    <MemoryRouter>
      <HeaderStatusSlot />
      <ServicesPage data={down} formRoute={null} navigate={() => {}} onAddService={() => {}} />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /Health: 1 problem/ }));
  expect(await screen.findByText('1 problem', { selector: '[role="status"]' })).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Filter by status' }).textContent).toMatch(
    /Offline\s*1/,
  );
});

it('does not open a sheet for the side panel selection when the arrangement changes', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('min-width'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  const wide = {
    ...data,
    statuses: { 7: { status: 'available', latencyMs: 5 } },
  } as unknown as Data;
  render(
    <MemoryRouter>
      <ServicesPage data={wide} formRoute={null} navigate={() => {}} onAddService={() => {}} />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'NAS: Online' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: 'Host' }));
  expect(await screen.findByRole('radio', { name: 'Host', checked: true })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  vi.restoreAllMocks();
});

const clock = {
  id: 3,
  pageId: 1,
  type: 'clock',
  name: 'Kitchen',
  config: { timeZone: '', format: '24h', showDate: true, showSeconds: false },
  connectionId: null,
  position: 0,
  version: 1,
  size: 'normal',
};
const withWidgets = { ...data, activePageId: 1 } as unknown as Data;

function showWithWidget(wide: boolean) {
  // The arrangement chosen by an earlier test is saved in this browser.
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(url === '/api/page-widgets' ? [clock] : [])),
    ),
  );
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: wide && query.includes('min-width'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  render(
    <MemoryRouter>
      <ServicesPage
        data={withWidgets}
        formRoute={null}
        navigate={() => {}}
        onAddService={() => {}}
      />
    </MemoryRouter>,
  );
}

it('puts the widgets in the column and gives their place to a chosen service, with a way back', async () => {
  showWithWidget(true);
  const column = await screen.findByRole('complementary', { name: 'Page widgets' });
  await waitFor(() => expect(column.textContent).toContain('Kitchen'));
  expect(screen.queryByRole('region', { name: 'Selected service' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^NAS: / }));
  expect(screen.getByRole('region', { name: 'Selected service' }).textContent).toContain('NAS');
  expect(screen.queryByText('Kitchen')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Back to widgets' }));
  expect(await screen.findByText('Kitchen')).toBeTruthy();
});

it('folds the widgets away above the groups where there is no column, and remembers it', async () => {
  showWithWidget(false);
  const toggle = await screen.findByRole('button', { name: /Hide widgets/ });
  expect(screen.getByText('Kitchen')).toBeTruthy();
  fireEvent.click(toggle);
  expect(screen.queryByText('Kitchen')).toBeNull();
  expect(screen.getByRole('button', { name: /Show widgets/ })).toBeTruthy();
  expect(localStorage.getItem('homora-widgets-open')).toBe('off');
  localStorage.clear();
});
