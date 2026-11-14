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
