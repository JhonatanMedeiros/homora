// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { MemoryRouter } from 'react-router';
import { useBrowseState } from '@/features/dashboard/use-browse-state';
import { MaintenancePage } from './maintenance-page';
import { setLocale } from '@/i18n';
import type { useServices } from '@/hooks/use-services';

type Data = ReturnType<typeof useServices>;
const services = [
  { id: 1, name: 'NAS', url: 'http://nas.lan/', category: 'Home', description: '' },
];
const data = {
  services,
  loaded: true,
  groupRows: [],
  statuses: {},
  categories: ['Home'],
  pages: [],
  activePageId: 0,
  pageIdOf: () => 0,
  sortedIn: () => services,
  blockedIds: new Set<number>(),
} as unknown as Data;

const windows = () => [
  {
    id: 1,
    serviceId: 1,
    startsAt: Date.now() - 60_000,
    endsAt: Date.now() + 3_600_000,
    note: 'Open now note',
  },
  {
    id: 2,
    serviceId: 99,
    startsAt: Date.now() + 86_400_000,
    endsAt: Date.now() + 90_000_000,
    note: 'Later note',
  },
];

function stubApi(maintenance: () => Response, onDelete: () => Response = () => new Response('{}')) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') return onDelete();
    if (url === '/api/maintenance') return maintenance();
    return new Response('[]');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function Harness({ value, navigate }: { value: Data; navigate: (path: string) => void }) {
  const browse = useBrowseState(0);
  return <MaintenancePage data={value} browse={browse} navigate={navigate} />;
}
function show(value: Data = data) {
  const navigate = vi.fn();
  render(
    <MemoryRouter>
      <Harness value={value} navigate={navigate} />
    </MemoryRouter>,
  );
  return navigate;
}

beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.unstubAllGlobals();
});

it('separates the open windows from the scheduled ones and links to the service', async () => {
  stubApi(() => new Response(JSON.stringify({ windows: windows() })));
  const navigate = show();
  const open = await screen.findByRole('region', { name: 'Open now' });
  expect(open.textContent).toContain('Open now note');
  const next = screen.getByRole('region', { name: 'Scheduled' });
  // A window whose service was removed still says what it is.
  expect(next.textContent).toContain('Removed service');
  fireEvent.click(within(open).getByRole('button', { name: 'NAS' }));
  expect(navigate).toHaveBeenCalledWith('/services/1');
});

it('says there is nothing scheduled, and waits for a service before scheduling', async () => {
  stubApi(() => new Response(JSON.stringify({ windows: [] })));
  show();
  expect(await screen.findByText('No maintenance is open or scheduled')).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Schedule maintenance' }).disabled,
  ).toBe(true);
});

it('says that maintenance could not be loaded and tries again', async () => {
  let fail = true;
  stubApi(() =>
    fail ? new Response('', { status: 500 }) : new Response(JSON.stringify({ windows: [] })),
  );
  show();
  const retry = await screen.findByRole('button', { name: /try again|retry/i });
  expect(screen.queryByText('No maintenance is open or scheduled')).toBeNull();
  fail = false;
  fireEvent.click(retry);
  expect(await screen.findByText('No maintenance is open or scheduled')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /try again|retry/i })).toBeNull();
});

it('keeps the window and explains when ending it fails', async () => {
  const fetchMock = stubApi(
    () => new Response(JSON.stringify({ windows: windows() })),
    () => new Response('{}', { status: 500 }),
  );
  show();
  const open = await screen.findByRole('region', { name: 'Open now' });
  fireEvent.click(within(open).getByRole('button', { name: /end/i }));
  await waitFor(() => expect(within(open).getByRole('alert').textContent).not.toBe(''));
  expect(open.textContent).toContain('Open now note');
  expect(fetchMock).toHaveBeenCalledWith('/api/maintenance/1', { method: 'DELETE' });
});

it('asks for a service first when there is none', () => {
  stubApi(() => new Response(JSON.stringify({ windows: [] })));
  show({ ...data, services: [] } as Data);
  expect(screen.getByText('Add a service before scheduling maintenance.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Schedule maintenance' })).toBeNull();
});
