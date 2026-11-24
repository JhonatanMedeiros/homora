import { runAdapterContract } from '../../../test-support/adapter-contract.js';
import type { FakeTransport } from '../../../test-support/adapter-contract.js';
import { fixture, urlCases, long } from '../../../test-support/integration-test-support.js';
import { createOmadaAdapter } from './backend.js';

export const NOW = 1_790_003_600_000;
const tokenId = 'client-id-SYNTHETIC';
const secret = 'client-secret-SYNTHETIC';
const omadacId = 'cccccccccccccccccccccccccccccccc';
const siteId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
export const validConfig = {
  url: 'https://omada.example.test',
  omadacId,
  siteId,
  tokenId,
  secret,
};

/** Routes one fixture per documented endpoint when the harness answers with a route table. */
const routes = {
  sites: fixture('omada/sites.json'),
  clients: fixture('omada/clients.json'),
  devices: fixture('omada/devices.json'),
  alerts: fixture('omada/alerts.json'),
  collection: fixture('omada/history-enable.json'),
};
const routed = { __routes: routes };
export function routeOf(path: string) {
  if (path.includes('/logs/alerts')) return 'alerts';
  if (path.includes('/devices')) return 'devices';
  if (path.includes('/clients')) return 'clients';
  if (path.includes('/history-enable')) return 'collection';
  return 'sites';
}
const create = (transport: FakeTransport) =>
  createOmadaAdapter(
    async (request) => {
      const response = await transport(request);
      const body = response.body as { __routes?: Record<string, unknown> } | null;
      return response.status === 200 && body?.__routes
        ? { status: 200, body: body.__routes[routeOf(request.path)] }
        : response;
    },
    (code) => new Error(code),
    () => NOW,
  );
const ok = { ...validConfig };

runAdapterContract({
  name: 'omada',
  create,
  validConfig,
  secrets: [secret, tokenId],
  pathFields: ['omadacId', 'siteId'],
  invalidConfigs: [
    ...urlCases(['http://omada.example.test', 'https://omada.example.test/prefix']).map(
      ({ label, url }) => ({ label, config: { ...ok, url } }),
    ),
    { label: 'short Omada ID', config: { ...ok, omadacId: 'abc' } },
    { label: 'long site ID', config: { ...ok, siteId: 'a'.repeat(65) } },
    { label: 'missing client ID', config: { ...ok, tokenId: '' } },
    { label: 'client ID with a space', config: { ...ok, tokenId: 'a b' } },
    { label: 'oversized client ID', config: { ...ok, tokenId: 'a'.repeat(257) } },
    { label: 'missing secret', config: { ...ok, secret: '' } },
    { label: 'secret with a newline', config: { ...ok, secret: 'a\nb' } },
    { label: 'oversized secret', config: { ...ok, secret: long } },
    { label: 'null config', config: null },
  ],
  fixtures: {
    valid: {
      body: routed,
      expected: {
        clients: { total: 12, wired: 3, wireless: 9 },
        clientCollection: 'enabled',
        devices: {
          ap: {
            total: 5,
            connected: 2,
            disconnected: 0,
            pending: 1,
            heartbeatMissed: 1,
            isolated: 0,
            unknown: 1,
          },
          switch: {
            total: 2,
            connected: 1,
            disconnected: 1,
            pending: 0,
            heartbeatMissed: 0,
            isolated: 0,
            unknown: 0,
          },
          gateway: {
            total: 1,
            connected: 1,
            disconnected: 0,
            pending: 0,
            heartbeatMissed: 0,
            isolated: 0,
            unknown: 0,
          },
          other: 1,
        },
        alerts: { unresolved: 3, windowHours: 24 },
        unavailable: {},
      },
    },
    wrongShape: [
      { label: 'empty object', body: {} },
      { label: 'string error code', body: { errorCode: '0', result: {} } },
      { label: 'result is a list', body: { errorCode: 0, result: [] } },
      { label: 'missing envelope', body: { totalRows: 1, data: [] } },
    ],
    oversized: [
      { label: 'huge row count', body: { errorCode: 0, result: { totalRows: 1e30, data: [] } } },
      { label: 'negative row count', body: { errorCode: 0, result: { totalRows: -1, data: [] } } },
    ],
    echoSecret: (value) => ({
      errorCode: 0,
      result: { totalRows: 1, currentPage: 1, data: [{ siteId: value }] },
    }),
  },
});
