import { hasControlChars, parseHttpUrl } from '@homora/utils';
import type { IntegrationAdapter, IntegrationTransport, InputErrorFactory } from '../../backend.js';
import { omadaDefinition } from './definition.js';
import {
  ALERT_PAGE_SIZE,
  ALERT_WINDOW_HOURS,
  AUTH_ERROR_CODES,
  DEVICE_MAX_PAGES,
  DEVICE_PAGE_SIZE,
  OMADA_ID_PATTERN,
  SITE_MAX_PAGES,
  SITE_PAGE_SIZE,
  OmadaInvalid,
  addDevices,
  emptyDevices,
  parseAlerts,
  parseClients,
  parseCollection,
  parseDevicePage,
  parseEnvelope,
  parseSiteIds,
  type OmadaSummary,
  type OmadaUnavailable,
} from './contracts.js';

export type OmadaConfig = {
  url: string;
  omadacId: string;
  siteId: string;
  tokenId: string;
  secret: string;
};

/** Per-response cap (2 MB at most) and the number of requests allowed in flight at once. */
const MAX_BODY = 2_000_000;
const SMALL_BODY = 262_144;
const CONCURRENCY = 4;
const credential = /^[\x21-\x7E]{1,256}$/;

export type OmadaErrorKind =
  | 'auth'
  | 'rate-limited'
  | 'certificate'
  | 'site'
  | 'incomplete'
  | 'unavailable';
/** Fixed messages only: the Controller's text, status text and transport errors never reach them. */
const MESSAGES: Record<OmadaErrorKind, string> = {
  auth: 'Omada rejected the credentials or permissions.',
  'rate-limited': 'Omada is limiting requests; try again later.',
  certificate: 'The Omada certificate could not be verified.',
  site: 'The Omada site was not found or is not accessible.',
  incomplete: 'The Omada list is longer than Homora reads.',
  unavailable: 'Could not query Omada.',
};
export class OmadaError extends Error {
  constructor(
    readonly kind: OmadaErrorKind,
    readonly retryAfterSeconds?: number,
  ) {
    super(MESSAGES[kind]);
    this.name = 'OmadaError';
  }
}
const CERTIFICATE_CODES =
  /^(?:ERR_TLS_CERT_ALTNAME_INVALID|CERT_[A-Z_]+|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_(?:VERIFY_LEAF_SIGNATURE|GET_ISSUER_CERT(?:_LOCALLY)?)|ERR_SSL_[A-Z_]+)$/;

/** Maps a thrown transport error to a fixed error; only the error code is inspected. */
function transportError(error: unknown): OmadaError {
  if (error instanceof OmadaError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && CERTIFICATE_CODES.test(code))
    return new OmadaError('certificate');
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Integration authentication')) return new OmadaError('auth');
  return new OmadaError('unavailable');
}

/** These failures affect every section, so they fail the whole observation. */
const isFatal = (error: OmadaError) =>
  error.kind === 'auth' || error.kind === 'rate-limited' || error.kind === 'certificate';

const verified = new WeakMap<IntegrationTransport, Set<string>>();

export function createOmadaAdapter(
  transport: IntegrationTransport,
  inputError: InputErrorFactory,
  now: () => number = Date.now,
): IntegrationAdapter<OmadaConfig, OmadaSummary> {
  function validate(config: OmadaConfig): OmadaConfig {
    if (!config || typeof config !== 'object') throw inputError('invalid-data');
    const url = parseHttpUrl(config.url, {
      httpsOnly: true,
      allowPath: false,
      allowQuery: false,
      allowHash: false,
      maxLength: 2048,
    });
    if (!url) throw inputError('https-url-required');
    // Both identifiers end up in a request path, so only a strict allow-list is accepted.
    if (typeof config.omadacId !== 'string' || !OMADA_ID_PATTERN.test(config.omadacId))
      throw inputError('invalid-config');
    if (typeof config.siteId !== 'string' || !OMADA_ID_PATTERN.test(config.siteId))
      throw inputError('invalid-config');
    for (const value of [config.tokenId, config.secret])
      if (typeof value !== 'string' || !credential.test(value) || hasControlChars(value))
        throw inputError('invalid-token');
    return {
      url: url.origin,
      omadacId: config.omadacId,
      siteId: config.siteId,
      tokenId: config.tokenId,
      secret: config.secret,
    };
  }

  async function get(config: OmadaConfig, path: string, maxBodyBytes: number) {
    let response;
    try {
      response = await transport({ origin: config.url, path, maxBodyBytes });
    } catch (error) {
      throw transportError(error);
    }
    if (response.status === 401) throw new OmadaError('auth');
    if (response.status === 429) throw new OmadaError('rate-limited', response.retryAfterSeconds);
    if (response.status !== 200) throw new OmadaError('unavailable');
    // HTTP 200 can still carry an error: -44112 is not treated as expiry, only as a rejection.
    try {
      const { errorCode } = parseEnvelope(response.body);
      if (AUTH_ERROR_CODES.includes(errorCode)) throw new OmadaError('auth');
    } catch (error) {
      if (error instanceof OmadaError) throw error;
      throw new OmadaError('unavailable');
    }
    return response.body;
  }
  /** Parses with a contract parser; any invalid or error envelope becomes an unavailable section. */
  async function read<T>(
    config: OmadaConfig,
    path: string,
    maxBodyBytes: number,
    parse: (body: unknown) => T,
  ): Promise<T> {
    const body = await get(config, path, maxBodyBytes);
    try {
      return parse(body);
    } catch (error) {
      if (error instanceof OmadaInvalid) throw new OmadaError('unavailable');
      throw error;
    }
  }

  /** The site must be in the authenticated list. The list is read completely or not at all. */
  async function verifySite(config: OmadaConfig, base: string) {
    const known = verified.get(transport) ?? new Set<string>();
    verified.set(transport, known);
    const key = `${config.omadacId}/${config.siteId}`;
    if (known.has(key)) return;
    for (let page = 1; page <= SITE_MAX_PAGES; page++) {
      const { totalRows, ids } = await read(
        config,
        `${base}/sites?page=${page}&pageSize=${SITE_PAGE_SIZE}`,
        SMALL_BODY,
        (body) => parseSiteIds(body, page),
      );
      if (ids.includes(config.siteId)) {
        known.add(key);
        return;
      }
      if (page * SITE_PAGE_SIZE >= totalRows) throw new OmadaError('site');
    }
    // A longer list cannot be read within the bound: never guess that the site is absent.
    throw new OmadaError('unavailable');
  }

  async function devices(config: OmadaConfig, base: string): Promise<OmadaSummary['devices']> {
    const path = (page: number) => `${base}/devices?page=${page}&pageSize=${DEVICE_PAGE_SIZE}`;
    const first = await read(config, path(1), MAX_BODY, (body) => parseDevicePage(body, 1));
    if (first.totalRows > DEVICE_MAX_PAGES * DEVICE_PAGE_SIZE) throw new OmadaError('incomplete');
    const pages = Math.ceil(first.totalRows / DEVICE_PAGE_SIZE);
    const all = [...first.devices];
    for (let from = 2; from <= pages; from += CONCURRENCY) {
      const numbers = Array.from(
        { length: Math.min(CONCURRENCY, pages - from + 1) },
        (_, index) => from + index,
      );
      const results = await Promise.all(
        numbers.map((page) =>
          read(config, path(page), MAX_BODY, (body) => parseDevicePage(body, page)),
        ),
      );
      for (const result of results) {
        // A changing total means the list moved while it was read.
        if (result.totalRows !== first.totalRows) throw new OmadaError('unavailable');
        all.push(...result.devices);
      }
    }
    if (new Set(all.map(({ mac }) => mac)).size !== all.length || all.length !== first.totalRows)
      throw new OmadaError('unavailable');
    const summary = emptyDevices();
    addDevices(summary, all);
    return summary;
  }

  return {
    type: omadaDefinition.type,
    label: omadaDefinition.label,
    capabilities: omadaDefinition.capabilities,
    validate,
    async collect(input) {
      const config = validate(input);
      const base = `/openapi/v1/${config.omadacId}`;
      const site = `${base}/sites/${config.siteId}`;
      await verifySite(config, base);
      const end = now();
      const window = { start: end - ALERT_WINDOW_HOURS * 3_600_000, end };
      const alertPath =
        `${site}/logs/alerts?page=1&pageSize=${ALERT_PAGE_SIZE}` +
        `&filters.timeStart=${window.start}&filters.timeEnd=${window.end}&filters.resolved=false`;
      const settle = async <T>(task: () => Promise<T>): Promise<T | OmadaError> => {
        try {
          return await task();
        } catch (error) {
          return transportError(error);
        }
      };
      const [clients, collection, deviceResult, alerts] = await Promise.all([
        settle(() =>
          read(config, `${site}/clients?page=1&pageSize=1`, SMALL_BODY, (body) =>
            parseClients(body, 1),
          ),
        ),
        settle(async () =>
          parseCollection(
            await get(config, `${base}/controller/client/history-enable`, SMALL_BODY),
          ),
        ),
        settle(() => devices(config, site)),
        settle(() => read(config, alertPath, SMALL_BODY, (body) => parseAlerts(body, window))),
      ]);
      const failures = [clients, collection, deviceResult, alerts].filter(
        (value): value is OmadaError => value instanceof OmadaError,
      );
      // Credentials, TLS and rate limits are fatal for every section: never a partial success.
      const fatal = failures.find(isFatal);
      if (fatal) throw fatal;

      const unavailable: OmadaUnavailable = {};
      // A failed or unreadable switch state is unknown, not disabled.
      const state = collection instanceof OmadaError ? 'unknown' : collection;
      let clientData: OmadaSummary['clients'] = null;
      if (clients instanceof OmadaError) unavailable.clients = 'failed';
      else if (state === 'disabled') unavailable.clients = 'collection-disabled';
      // Without a readable switch a zero is ambiguous; a positive count shows data is collected.
      else if (state === 'unknown' && clients.total === 0)
        unavailable.clients = 'collection-unknown';
      else clientData = clients;
      let deviceData: OmadaSummary['devices'] = null;
      if (deviceResult instanceof OmadaError)
        unavailable.devices = deviceResult.kind === 'incomplete' ? 'incomplete' : 'failed';
      else deviceData = deviceResult;
      let alertData: OmadaSummary['alerts'] = null;
      if (alerts instanceof OmadaError) unavailable.alerts = 'failed';
      else alertData = alerts;
      // Nothing usable: an all-failed observation must fail, never become a cached success.
      if (!clientData && !deviceData && !alertData) throw new OmadaError('unavailable');
      return {
        clients: clientData,
        clientCollection: state,
        devices: deviceData,
        alerts: alertData,
        unavailable,
      };
    },
  };
}
