// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
      <ServicesPage data={down} formRoute={null} navigate={() => {}} onAddService={() => {}} />
    </MemoryRouter>,
  );
  const section = await screen.findByRole('region', { name: 'Probes' });
  expect(section.textContent).toContain('Internet');
  expect(section.textContent).toContain('Offline');
  expect(screen.getByRole('region', { name: 'Needs attention' })).toBeTruthy();
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
      <ServicesPage data={down} formRoute={null} navigate={() => {}} onAddService={() => {}} />
    </MemoryRouter>,
  );
  expect(await screen.findByText('1 service has a problem')).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Filter by status' }).textContent).toMatch(
    /Offline\s*1/,
  );
});
