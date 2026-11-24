import { describe, expect, it, vi } from 'vitest';
import { createOmadaAdapter, OmadaError } from './backend.js';
import { createOmadaPresentation } from './frontend.js';
import { createOmadaRegistration } from './registration.js';
import { fixture } from '../../../test-support/integration-test-support.js';
import type { IntegrationTransport } from '../../backend.js';

const NOW = 1_790_003_600_000;
const config = {
  url: 'https://omada.example.test',
  omadacId: 'cccccccccccccccccccccccccccccccc',
  siteId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  tokenId: 'client-id-SYNTHETIC',
  secret: 'client-secret-SYNTHETIC',
};
type Response = { status: number; body?: unknown; retryAfterSeconds?: number } | Error;
type Routes = Partial<Record<'sites' | 'clients' | 'devices' | 'alerts' | 'collection', Response>>;
const envelope = (result: unknown, errorCode = 0) => ({ errorCode, msg: 'Success.', result });
const page = (rows: unknown[], totalRows = rows.length, currentPage = 1) =>
  envelope({ totalRows, currentPage, currentSize: 50, data: rows });
const sites = { status: 200, body: fixture('omada/sites.json') } as const;
const base: Required<Routes> = {
  sites,
  clients: { status: 200, body: fixture('omada/clients.json') },
  devices: { status: 200, body: fixture('omada/devices.json') },
  alerts: { status: 200, body: fixture('omada/alerts.json') },
  collection: { status: 200, body: fixture('omada/history-enable.json') },
};
const kind = (path: string) =>
  path.includes('/logs/alerts')
    ? 'alerts'
    : path.includes('/devices')
      ? 'devices'
      : path.includes('/clients')
        ? 'clients'
        : path.includes('/history-enable')
          ? 'collection'
          : 'sites';
function setup(over: Routes | ((path: string) => Response | undefined) = {}) {
  const calls: string[] = [];
  let inFlight = 0;
  let peak = 0;
  const transport = vi.fn<IntegrationTransport>(async (request) => {
    calls.push(request.path);
    inFlight++;
    peak = Math.max(peak, inFlight);
    await Promise.resolve();
    inFlight--;
    const chosen =
      typeof over === 'function'
        ? (over(request.path) ?? base[kind(request.path)])
        : (over[kind(request.path)] ?? base[kind(request.path)]);
    if (chosen instanceof Error) throw chosen;
    return {
      status: chosen.status,
      body: chosen.body ?? null,
      ...(chosen.retryAfterSeconds ? { retryAfterSeconds: chosen.retryAfterSeconds } : {}),
    };
  });
  const adapter = createOmadaAdapter(
    transport,
    (code) => new Error(code),
    () => NOW,
  );
  return { adapter, transport, calls, peak: () => peak };
}
const device = (index: number, type = 'ap', status: unknown = 1) => ({
  mac: `AA-00-00-00-20-${String(index).padStart(4, '0')}`,
  type,
  status,
});
const devicePages =
  (total: number, over: (index: number) => unknown = (i) => device(i)) =>
  (path: string): Response | undefined => {
    if (kind(path) !== 'devices') return undefined;
    const current = Number(new URL(path, 'https://x.test').searchParams.get('page'));
    const rows = Array.from({ length: total }, (_, i) => over(i)).slice(
      (current - 1) * 50,
      current * 50,
    );
    return { status: 200, body: page(rows, total, current) };
  };
const unavailableDash = '—';

describe('requests', () => {
  it('uses only GET paths built from validated IDs, with required paging and a bounded window', async () => {
    const { adapter, calls } = setup();
    await adapter.collect(config);
    const root = `/openapi/v1/${config.omadacId}`;
    expect(calls).toContain(`${root}/sites?page=1&pageSize=50`);
    expect(calls).toContain(`${root}/sites/${config.siteId}/clients?page=1&pageSize=1`);
    expect(calls).toContain(`${root}/sites/${config.siteId}/devices?page=1&pageSize=50`);
    expect(calls).toContain(`${root}/controller/client/history-enable`);
    const alert = calls.find((path) => path.includes('/logs/alerts'))!;
    const query = new URL(alert, 'https://x.test').searchParams;
    expect(query.get('page')).toBe('1');
    expect(query.get('pageSize')).toBe('10');
    expect(query.get('filters.resolved')).toBe('false');
    expect(query.get('filters.timeEnd')).toBe(String(NOW));
    expect(query.get('filters.timeStart')).toBe(String(NOW - 24 * 3_600_000));
  });
  it('never sends credentials or an authorization value of its own', async () => {
    const { adapter, transport } = setup();
    await adapter.collect(config);
    for (const [request] of transport.mock.calls) {
      expect(Object.keys(request).sort()).toEqual(['maxBodyBytes', 'origin', 'path']);
      expect(JSON.stringify(request)).not.toContain(config.secret);
      expect(request.maxBodyBytes).toBeLessThanOrEqual(2_000_000);
    }
  });
  it('verifies the site once per transport', async () => {
    const { adapter, calls } = setup();
    await adapter.collect(config);
    await adapter.collect(config);
    expect(calls.filter((path) => kind(path) === 'sites')).toHaveLength(1);
  });
});

describe('site selection', () => {
  it('rejects a site missing from the complete list with a fixed error and reads nothing else', async () => {
    const { adapter, calls } = setup();
    await expect(
      adapter.collect({ ...config, siteId: 'dddddddddddddddddddddddd' }),
    ).rejects.toThrow('The Omada site was not found or is not accessible.');
    expect(calls).toHaveLength(1);
  });
  it('finds the site on a later page and refuses to guess when the list exceeds the ceiling', async () => {
    const id = (n: number) => `s${String(n).padStart(23, '0')}`;
    const listing =
      (total: number) =>
      (path: string): Response | undefined => {
        if (kind(path) !== 'sites') return undefined;
        const current = Number(new URL(path, 'https://x.test').searchParams.get('page'));
        const rows = Array.from({ length: total }, (_, i) => ({ siteId: id(i) })).slice(
          (current - 1) * 50,
          current * 50,
        );
        return { status: 200, body: page(rows, total, current) };
      };
    const found = setup(listing(120));
    await expect(found.adapter.collect({ ...config, siteId: id(110) })).resolves.toBeTruthy();
    const capped = setup(listing(1500));
    await expect(capped.adapter.collect({ ...config, siteId: id(1400) })).rejects.toThrow(
      'Could not query Omada.',
    );
    expect(capped.calls.filter((path) => kind(path) === 'sites')).toHaveLength(20);
  });
  it('rejects malformed site lists', async () => {
    for (const body of [page([{ siteId: 'bad id' }]), page([{}]), page([], 3), envelope({}, 5)]) {
      const { adapter } = setup({ sites: { status: 200, body } });
      await expect(adapter.collect(config)).rejects.toThrow('Could not query Omada.');
    }
  });
});

describe('clients and collection state', () => {
  const collection = (clientStatEnable: unknown, clientsDataEnable: unknown): Response => ({
    status: 200,
    body: envelope({ clientStatEnable, clientsDataEnable }),
  });
  const clients = (total: number, wired: number, wireless: number): Response => ({
    status: 200,
    body: envelope({
      totalRows: total,
      currentPage: 1,
      currentSize: 1,
      data: total ? [{}] : [],
      clientStat: { total, wired, wireless },
    }),
  });
  it('shows a legitimate zero only when collection is verified enabled', async () => {
    const data = await setup({ clients: clients(0, 0, 0) }).adapter.collect(config);
    expect(data.clients).toEqual({ total: 0, wired: 0, wireless: 0 });
    expect(data.clientCollection).toBe('enabled');
  });
  it('reports disabled collection as unavailable, even with a zero or nonzero count', async () => {
    for (const stat of [clients(0, 0, 0), clients(4, 1, 3)]) {
      const data = await setup({
        clients: stat,
        collection: collection(false, false),
      }).adapter.collect(config);
      expect(data.clients).toBeNull();
      expect(data.clientCollection).toBe('disabled');
      expect(data.unavailable.clients).toBe('collection-disabled');
    }
  });
  it('treats an unreadable or mixed switch as unknown: a zero is withheld, a positive count is kept', async () => {
    const unreadable: Response[] = [
      { status: 403 },
      { status: 404 },
      new Error('boom'),
      { status: 200, body: envelope({}) },
      { status: 200, body: envelope({ clientStatEnable: 'yes', clientsDataEnable: true }) },
      { status: 200, body: { errorCode: -1 } },
      collection(true, false),
    ];
    for (const response of unreadable) {
      const zero = await setup({ clients: clients(0, 0, 0), collection: response }).adapter.collect(
        config,
      );
      expect(zero.clientCollection).toBe('unknown');
      expect(zero.clients).toBeNull();
      expect(zero.unavailable.clients).toBe('collection-unknown');
      const some = await setup({ clients: clients(2, 1, 1), collection: response }).adapter.collect(
        config,
      );
      expect(some.clientCollection).toBe('unknown');
      expect(some.clients).toEqual({ total: 2, wired: 1, wireless: 1 });
    }
  });
  it('marks clients unavailable for an inconsistent aggregate without touching other sections', async () => {
    for (const body of [
      envelope({ data: [], clientStat: { total: 1, wired: 1, wireless: 1 } }),
      envelope({ data: [], clientStat: { total: 'x', wired: 0, wireless: 0 } }),
      envelope({ data: [], clientStat: { total: 5, wired: -1, wireless: 0 } }),
      envelope({ data: [{}, {}], clientStat: { total: 2, wired: 1, wireless: 1 } }),
      envelope({ data: [] }),
    ]) {
      const data = await setup({ clients: { status: 200, body } }).adapter.collect(config);
      expect(data.clients).toBeNull();
      expect(data.unavailable.clients).toBe('failed');
      expect(data.devices).not.toBeNull();
      expect(data.alerts).not.toBeNull();
    }
  });
});

describe('devices', () => {
  it('reads every page, with bounded concurrency, and classifies every state', async () => {
    const types = ['ap', 'switch', 'gateway', 'olt', 'router'];
    const statuses = [0, 1, 2, 3, 4, 7, 'x', null];
    const run = setup(devicePages(230, (i) => device(i, types[i % 5], statuses[i % 8])));
    const data = await run.adapter.collect(config);
    const calls = run.calls.filter((path) => kind(path) === 'devices');
    expect(calls).toHaveLength(5);
    expect(run.peak()).toBeLessThanOrEqual(4 + 1);
    const devices = data.devices!;
    const total = (['ap', 'switch', 'gateway'] as const).reduce(
      (sum, key) => sum + devices[key].total,
      0,
    );
    expect(total + devices.other).toBe(230);
    expect(devices.other).toBe(92);
    const group = devices.ap;
    expect(
      group.connected +
        group.disconnected +
        group.pending +
        group.heartbeatMissed +
        group.isolated +
        group.unknown,
    ).toBe(group.total);
    expect(group.unknown).toBeGreaterThan(0);
  });
  it('never counts a not-connected, transitional or unknown state as connected', async () => {
    const data = await setup(
      devicePages(5, (i) => device(i, 'switch', [0, 2, 3, 4, 99][i])),
    ).adapter.collect(config);
    expect(data.devices!.switch).toMatchObject({
      total: 5,
      connected: 0,
      disconnected: 1,
      pending: 1,
      heartbeatMissed: 1,
      isolated: 1,
      unknown: 1,
    });
  });
  it('reports a legitimate empty site as zero devices, not unavailable', async () => {
    const data = await setup(devicePages(0)).adapter.collect(config);
    expect(data.devices!.ap.total).toBe(0);
    expect(data.unavailable.devices).toBeUndefined();
  });
  it('never claims a total beyond the 20-page ceiling', async () => {
    const run = setup(devicePages(1001));
    const data = await run.adapter.collect(config);
    expect(data.devices).toBeNull();
    expect(data.unavailable.devices).toBe('incomplete');
    expect(run.calls.filter((path) => kind(path) === 'devices')).toHaveLength(1);
    const exact = await setup(devicePages(1000)).adapter.collect(config);
    expect(exact.devices!.ap.total).toBe(1000);
  });
  it('rejects duplicates, a moving total, short pages and malformed records', async () => {
    const moving = (path: string): Response | undefined => {
      if (kind(path) !== 'devices') return undefined;
      const current = Number(new URL(path, 'https://x.test').searchParams.get('page'));
      const rows = Array.from({ length: 50 }, (_, i) => device(i + (current - 1) * 50));
      return { status: 200, body: page(rows, current === 1 ? 100 : 101, current) };
    };
    const cases: ((path: string) => Response | undefined)[] = [
      devicePages(60, (i) => device(i % 55)),
      moving,
      devicePages(3, (i) => (i === 1 ? { type: 'ap', status: 1 } : device(i))),
      devicePages(3, (i) => (i === 1 ? null : device(i))),
      devicePages(3, (i) => device(i, i === 1 ? 'x'.repeat(33) : 'ap')),
      (path) =>
        kind(path) === 'devices' ? { status: 200, body: page([device(1)], 3) } : undefined,
      (path) =>
        kind(path) === 'devices' ? { status: 200, body: page([device(1)], 1, 2) } : undefined,
    ];
    for (const over of cases) {
      const data = await setup(over).adapter.collect(config);
      expect(data.devices).toBeNull();
      expect(data.unavailable.devices).toBe('failed');
      expect(data.clients).not.toBeNull();
    }
  });
  it('does not expose identifiers, names or serial numbers', async () => {
    const data = await setup().adapter.collect(config);
    expect(JSON.stringify(data)).not.toMatch(/AA-00|device-|SYNTHETIC|client-1|synthetic alert/i);
  });
});

describe('alerts', () => {
  it('uses the filtered total rather than the unfiltered aggregate', async () => {
    const data = await setup().adapter.collect(config);
    expect(data.alerts).toEqual({ unresolved: 3, windowHours: 24 });
  });
  it('shows a legitimate zero and a total larger than one page', async () => {
    const empty = await setup({ alerts: { status: 200, body: page([], 0) } }).adapter.collect(
      config,
    );
    expect(empty.alerts).toEqual({ unresolved: 0, windowHours: 24 });
    const rows = Array.from({ length: 10 }, () => ({ time: NOW - 1000, resolved: false }));
    const many = await setup({ alerts: { status: 200, body: page(rows, 4321) } }).adapter.collect(
      config,
    );
    expect(many.alerts?.unresolved).toBe(4321);
  });
  it('withholds the count when the filter or window was not honoured', async () => {
    const resolved = [{ time: NOW - 1, resolved: true }];
    const old = [{ time: NOW - 30 * 3_600_000, resolved: false }];
    const future = [{ time: NOW + 3_600_000, resolved: false }];
    for (const rows of [resolved, old, future]) {
      const data = await setup({ alerts: { status: 200, body: page(rows) } }).adapter.collect(
        config,
      );
      expect(data.alerts).toBeNull();
      expect(data.unavailable.alerts).toBe('failed');
    }
    // A second-resolution timestamp is not compared against the millisecond window.
    const seconds = await setup({
      alerts: { status: 200, body: page([{ time: 1_790_000_000 }]) },
    }).adapter.collect(config);
    expect(seconds.alerts?.unresolved).toBe(1);
  });
  it('rejects a malformed alert page', async () => {
    for (const body of [
      page([{}, {}], 1),
      page([], 2),
      envelope({ data: [] }),
      envelope({ totalRows: 1.5, data: [] }),
    ]) {
      const data = await setup({ alerts: { status: 200, body } }).adapter.collect(config);
      expect(data.alerts).toBeNull();
    }
  });
});

describe('failures', () => {
  it('lets a section fail alone and records why', async () => {
    const data = await setup({
      devices: { status: 500 },
      alerts: { status: 200, body: envelope({}, -1) },
    }).adapter.collect(config);
    expect(data.clients).not.toBeNull();
    expect(data.devices).toBeNull();
    expect(data.alerts).toBeNull();
    expect(data.unavailable).toEqual({ devices: 'failed', alerts: 'failed' });
  });
  it('treats HTTP 400 HTML, non-JSON and 403 on a section as unavailable', async () => {
    for (const devices of [
      { status: 400, body: '<html>bad</html>' },
      new Error('Resposta JSON inválida.'),
      { status: 403 },
      { status: 404 },
      { status: 500 },
    ] as Response[]) {
      const data = await setup({ devices }).adapter.collect(config);
      expect(data.devices).toBeNull();
      expect(data.clients).not.toBeNull();
    }
  });
  it('fails the whole observation when every section fails', async () => {
    const down: Response = { status: 500 };
    await expect(
      setup({ clients: down, devices: down, alerts: down }).adapter.collect(config),
    ).rejects.toThrow('Could not query Omada.');
    await expect(
      setup({
        clients: { status: 200, body: envelope({}, 3) },
        devices: down,
        alerts: down,
      }).adapter.collect(config),
    ).rejects.toThrow('Could not query Omada.');
  });
  it('treats authentication problems as fatal, never as a partial success', async () => {
    const cases: Routes[] = [
      { alerts: { status: 401 } },
      { devices: { status: 200, body: envelope({}, -44112) } },
      { clients: { status: 200, body: envelope({}, -44106) } },
      { sites: { status: 401 } },
      { sites: new Error('Integration authentication failed.') },
      { clients: new Error('Integration authentication unavailable.') },
    ];
    for (const routes of cases) {
      const error = await setup(routes)
        .adapter.collect(config)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(OmadaError);
      expect((error as OmadaError).kind).toBe('auth');
      expect((error as Error).message).toBe('Omada rejected the credentials or permissions.');
    }
  });
  it('reports a rate limit with its delay, even from one section', async () => {
    const error = await setup({ devices: { status: 429, retryAfterSeconds: 90 } })
      .adapter.collect(config)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OmadaError);
    expect((error as OmadaError).kind).toBe('rate-limited');
    expect((error as OmadaError).retryAfterSeconds).toBe(90);
  });
  it('maps certificate verification errors by code and never forwards transport text', async () => {
    for (const code of [
      'ERR_TLS_CERT_ALTNAME_INVALID',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
    ]) {
      const failure = Object.assign(
        new Error(`Hostname/IP does not match certificate's altnames: ${config.url}`),
        { code },
      );
      const error = await setup({ sites: failure })
        .adapter.collect(config)
        .catch((e: unknown) => e);
      expect((error as OmadaError).kind).toBe('certificate');
      expect((error as Error).message).toBe('The Omada certificate could not be verified.');
    }
    const dns = Object.assign(
      new Error(`getaddrinfo ENOTFOUND omada.example.test ${config.secret}`),
      { code: 'ENOTFOUND' },
    );
    const error = await setup({ sites: dns })
      .adapter.collect(config)
      .catch((e: unknown) => e);
    expect((error as Error).message).toBe('Could not query Omada.');
    expect(String(error)).not.toContain('omada.example.test');
  });
  it('requests a pause only for rejected credentials and rate limits', () => {
    const registration = createOmadaRegistration((code) => new Error(code));
    const delay = registration.retryDelaySeconds!;
    expect(delay(new OmadaError('auth'))).toBe(60);
    expect(delay(new OmadaError('rate-limited', 300))).toBe(300);
    expect(delay(new OmadaError('rate-limited'))).toBe(60);
    for (const kind of ['certificate', 'site', 'incomplete', 'unavailable'] as const)
      expect(delay(new OmadaError(kind))).toBeNull();
    expect(delay(new Error('other'))).toBeNull();
  });
});

describe('registration', () => {
  const registration = createOmadaRegistration((code) => new Error(code));
  it('declares a fixed, reviewed login that cannot carry credentials in the query', () => {
    const auth = registration.sessionAuth!;
    expect(auth.loginPath).toBe('/openapi/authorize/token');
    expect(auth.loginQuery).toEqual({ grant_type: 'client_credentials' });
    expect(auth.body).toEqual({
      omadacId: { source: 'config', key: 'omadacId' },
      client_id: { source: 'tokenId' },
      client_secret: { source: 'secret' },
    });
    expect(auth.tokenPath).toEqual(['result', 'accessToken']);
    expect(auth.validityPath).toEqual(['result', 'expiresIn']);
    expect(auth.successCode).toEqual({ path: ['errorCode'], value: 0 });
    expect(auth.sendAs).toEqual({ type: 'authorization', scheme: 'access-token' });
    expect(JSON.stringify(auth)).not.toMatch(/refreshToken|refresh_token/i);
  });
  it('marks the Controller and client identity so a change requires a new secret', () => {
    const identity = registration
      .definition!.fields.filter((field) => field.identity)
      .map(({ key }) => key);
    expect(identity.sort()).toEqual(['omadacId', 'tokenId']);
  });
  it('validates without any network access', () => {
    const transport = vi.fn<IntegrationTransport>();
    const prepare = registration.prepare!({
      publicConfig: { url: config.url, omadacId: config.omadacId, siteId: config.siteId },
      credentials: { tokenId: config.tokenId, secret: config.secret },
      transport,
    });
    expect(prepare).toBeTypeOf('function');
    expect(transport).not.toHaveBeenCalled();
    expect(() =>
      registration.prepare!({
        publicConfig: { url: config.url, omadacId: '../x', siteId: config.siteId },
        credentials: { tokenId: config.tokenId, secret: config.secret },
        transport,
      }),
    ).toThrow('invalid-config');
    expect(() =>
      registration.prepare!({
        publicConfig: { url: config.url, omadacId: config.omadacId, siteId: config.siteId },
        credentials: {},
        transport,
      }),
    ).toThrow('invalid-token');
  });
});

describe('presentation', () => {
  const t = (key: string) => key;
  const present = createOmadaPresentation(t);
  const group = (connected: number, total: number, unknown = 0) => ({
    total,
    connected,
    disconnected: total - connected - unknown,
    pending: 0,
    heartbeatMissed: 0,
    isolated: 0,
    unknown,
  });
  const full = {
    clients: { total: 12, wired: 3, wireless: 9 },
    clientCollection: 'enabled',
    devices: { ap: group(3, 4), switch: group(1, 1), gateway: group(1, 1), other: 0 },
    alerts: { unresolved: 0, windowHours: 24 },
    unavailable: {},
  };
  const find = (stats: { label: string; value: string }[] | null, label: string) =>
    stats?.find((stat) => stat.label === label)?.value;
  it('shows values, a verified zero and the 24 hour window in the label', () => {
    const stats = present.stats(full);
    expect(find(stats, 'omada.clients')).toBe('12');
    expect(find(stats, 'omada.wirelessWired')).toBe('9 / 3');
    expect(find(stats, 'omada.ap')).toBe('3/4');
    expect(find(stats, 'omada.alerts')).toBe('0');
    expect(stats).toHaveLength(6);
  });
  it('renders every unavailable section as a dash, never zero', () => {
    const stats = present.stats({
      ...full,
      clients: null,
      clientCollection: 'disabled',
      devices: null,
      alerts: null,
      unavailable: { clients: 'collection-disabled', devices: 'incomplete', alerts: 'failed' },
    });
    expect(find(stats, 'omada.clients')).toBe(unavailableDash);
    expect(find(stats, 'omada.wirelessWired')).toBe(unavailableDash);
    expect(find(stats, 'omada.clientHistory')).toBe('omada.collectionDisabled');
    expect(find(stats, 'omada.ap')).toBe('omada.incomplete');
    expect(find(stats, 'omada.alerts')).toBe(unavailableDash);
  });
  it('distinguishes unknown collection, failed clients, unknown states and other devices', () => {
    const unknown = present.stats({
      ...full,
      clients: null,
      clientCollection: 'unknown',
      unavailable: { clients: 'collection-unknown' },
    });
    expect(find(unknown, 'omada.clientHistory')).toBe('omada.collectionUnknown');
    const failed = present.stats({ ...full, clients: null, unavailable: { clients: 'failed' } });
    expect(find(failed, 'omada.clientHistory')).toBeUndefined();
    const extra = present.stats({
      ...full,
      devices: { ap: group(3, 4, 1), switch: group(1, 1), gateway: group(1, 1), other: 2 },
    });
    expect(find(extra, 'omada.unknownState')).toBe('1');
    expect(find(extra, 'omada.otherDevices')).toBe('2');
  });
  it('rejects malformed data instead of rendering zeros', () => {
    for (const value of [
      null,
      [],
      {},
      { ...full, clientCollection: 'maybe' },
      { ...full, alerts: { unresolved: -1, windowHours: 24 } },
      { ...full, alerts: { unresolved: 1, windowHours: 1 } },
      { ...full, devices: { ap: {} } },
    ])
      expect(present.stats(value)).toBeNull();
  });
  it('has a translation for every key it uses, in both languages', async () => {
    const { en, ptBR } = await import('./messages.js');
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
    for (const value of Object.values(ptBR)) expect(value.length).toBeGreaterThan(0);
    const used = new Set<string>();
    createOmadaPresentation((key) => (used.add(key), key)).stats({
      ...full,
      clients: null,
      clientCollection: 'disabled',
      unavailable: { clients: 'collection-disabled' },
      devices: { ap: group(1, 2, 1), switch: group(1, 1), gateway: group(1, 1), other: 1 },
    });
    createOmadaPresentation((key) => (used.add(key), key)).stats({
      ...full,
      clients: null,
      clientCollection: 'unknown',
      unavailable: { clients: 'collection-unknown', devices: 'incomplete' },
      devices: null,
    });
    for (const key of used) expect(Object.keys(en)).toContain(key);
  });
});
