// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router';
import { useBrowseState, type BrowseState } from '@/features/dashboard/use-browse-state';
import { HomePage } from './home-page';
import { setLocale } from '@/i18n';
import type { useServices } from '@/hooks/use-services';

type Data = ReturnType<typeof useServices>;
const service = (id: number, name: string, pinned = false) => ({
  id,
  name,
  url: `http://${name.toLowerCase()}.lan/`,
  category: 'Home',
  description: '',
  position: id,
  pinned,
});
const services = [service(1, 'Jellyfin', true), service(2, 'Radarr'), service(3, 'Sonarr')];
const statuses = {
  1: { status: 'available', latencyMs: 40 },
  2: { status: 'unavailable', reason: 'no-response' },
  3: { status: 'available', latencyMs: 1900 },
};

function dataWith(extra: Partial<Record<keyof Data, unknown>> = {}) {
  return {
    services,
    loaded: true,
    loadError: '',
    groupRows: [{ id: 1, name: 'Home', position: 0 }],
    statuses,
    statusError: false,
    statusAt: null,
    categories: ['Home'],
    pages: [],
    activePageId: 0,
    pageIdOf: () => 0,
    selectPage: () => {},
    sortedIn: () => services,
    blockedIds: new Set<number>(),
    refresh: vi.fn(async () => {}),
    retryStatuses: vi.fn(),
    pin: vi.fn(async () => true),
    ...extra,
  } as unknown as Data;
}

const overview = {
  incidents7d: 2,
  incidentsPrevious7d: 1,
  mttrMs: 60_000,
  longestCleanMs: 3_600_000,
  open: {},
  settings: { 3: { failureThreshold: 1, recoveryThreshold: 1, degradedLatencyMs: 800 } },
  sla: { targetPct: 99, actualPct: 99.5 },
};

function stubApi(replies: Record<string, unknown> = {}) {
  const all: Record<string, unknown> = {
    '/api/status-overview': overview,
    '/api/maintenance': { windows: [] },
    ...replies,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => new Response(JSON.stringify(all[url] ?? []))),
  );
}

function Harness({
  data,
  navigate,
  onBrowse,
}: {
  data: Data;
  navigate: (path: string) => void;
  onBrowse: (browse: BrowseState) => void;
}) {
  const browse = useBrowseState(0);
  useEffect(() => onBrowse(browse));
  return <HomePage data={data} browse={browse} navigate={navigate} onEditService={() => {}} />;
}
function show(data: Data = dataWith()) {
  const navigate = vi.fn();
  const onBrowse = vi.fn<(browse: BrowseState) => void>();
  render(
    <MemoryRouter>
      <Harness data={data} navigate={navigate} onBrowse={onBrowse} />
    </MemoryRouter>,
  );
  return { navigate, data, browse: () => onBrowse.mock.lastCall![0] };
}

beforeEach(() => {
  setLocale('en');
  localStorage.clear();
  stubApi();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('opens with pinned services, what needs attention and the health numbers', async () => {
  show();
  const pinned = screen.getByRole('region', { name: 'Pinned' });
  expect(
    within(pinned)
      .getByRole('link', { name: /Jellyfin/ })
      .getAttribute('href'),
  ).toBe('http://jellyfin.lan/');
  const attention = screen.getByRole('region', { name: 'Needs attention' });
  expect(attention.textContent).toContain('Radarr');
  expect(await screen.findByText('Sonarr degraded (1900 ms)')).toBeTruthy();
  expect(
    await screen.findByRole('button', {
      name: 'Sonarr: 1900 ms, slow limit 800 ms',
    }),
  ).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Availability target' }).textContent).toContain(
    '99.5%',
  );
});

it('opens Services filtered by the state chosen in the strip', async () => {
  const { navigate, browse } = show();
  fireEvent.click(await screen.findByRole('button', { name: 'Show Offline: 1' }));
  expect(browse().statusFilter).toBe('down');
  expect(navigate).toHaveBeenCalledWith('/services');
});

it('says calmly that nothing needs attention when everything answers', async () => {
  show(
    dataWith({
      statuses: {
        1: { status: 'available', latencyMs: 10 },
        2: { status: 'available', latencyMs: 10 },
        3: { status: 'available', latencyMs: 10 },
      },
    }),
  );
  expect(await screen.findByText('Nothing needs attention')).toBeTruthy();
});

it('does not claim all is well when statuses are unknown or stale', () => {
  const data = dataWith({ statuses: {}, statusError: true });
  show(data);
  expect(screen.queryByText('Nothing needs attention')).toBeNull();
  expect(screen.getByText('Nothing is reported offline')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
  expect(data.retryStatuses).toHaveBeenCalled();
});

it('explains that Homora cannot measure instead of listing failures', async () => {
  stubApi({
    '/api/status-overview': { ...overview, measurement: { reason: 'network' } },
  });
  const { navigate } = show();
  fireEvent.click(await screen.findByRole('button', { name: 'Review connections' }));
  expect(navigate).toHaveBeenCalledWith('/manage/integrations');
});

it('lists the maintenance ahead and links to all of it', async () => {
  stubApi({
    '/api/maintenance': {
      windows: [
        {
          id: 4,
          serviceId: 1,
          startsAt: Date.now() + 3_600_000,
          endsAt: Date.now() + 7_200_000,
          note: 'Disk swap',
        },
      ],
    },
  });
  const { navigate } = show();
  expect(await screen.findByText('Disk swap')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'All maintenance' }));
  expect(navigate).toHaveBeenCalledWith('/maintenance');
});

it('offers the first service when there is none', () => {
  const { navigate } = show(dataWith({ services: [], statuses: {}, sortedIn: () => [] }));
  expect(screen.queryByRole('region', { name: 'Needs attention' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /add/i }));
  expect(navigate).toHaveBeenCalledWith('/manage/services/new');
});

it('shows the load failure with a way to retry', () => {
  const data = dataWith({ loaded: false, loadError: 'Could not load', services: [] });
  show(data);
  expect(screen.getByText('Could not load')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
  expect(data.refresh).toHaveBeenCalled();
});

it('opens the details in a sheet on narrow screens', async () => {
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: /Details.*Jellyfin|Jellyfin.*details/i }),
  );
  expect(await screen.findByRole('dialog', { name: 'Jellyfin' })).toBeTruthy();
});

it('shows the details in a column beside the summary on wide screens', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('min-width'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  show();
  const panel = await screen.findByRole('region', { name: 'Selected service' });
  // The first problem is selected before anything is chosen.
  expect(within(panel).getByRole('heading', { name: 'Radarr' })).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: /^Jellyfin: Online/ }));
  expect(within(panel).getByRole('heading', { name: 'Jellyfin' })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});
