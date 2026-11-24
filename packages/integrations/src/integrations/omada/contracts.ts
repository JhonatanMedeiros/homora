/**
 * Parsers and bounds for the Omada Open API v1 read endpoints used by the widget. Every response is
 * untrusted: the envelope is checked, only counts are kept and no identifier, name, address, log
 * text or token leaves this module.
 */
export type OmadaCollection = 'enabled' | 'disabled' | 'unknown';
export type OmadaDeviceGroup = {
  total: number;
  connected: number;
  disconnected: number;
  pending: number;
  heartbeatMissed: number;
  isolated: number;
  /** A status the Controller documentation does not list: never counted as connected. */
  unknown: number;
};
export type OmadaDevices = {
  ap: OmadaDeviceGroup;
  switch: OmadaDeviceGroup;
  gateway: OmadaDeviceGroup;
  /** Devices of a type this integration does not classify (for example an OLT). */
  other: number;
};
export type OmadaUnavailable = {
  clients?: 'collection-disabled' | 'collection-unknown' | 'failed';
  devices?: 'incomplete' | 'failed';
  alerts?: 'failed';
};
export type OmadaSummary = {
  clients: { total: number; wired: number; wireless: number } | null;
  clientCollection: OmadaCollection;
  devices: OmadaDevices | null;
  alerts: { unresolved: number; windowHours: 24 } | null;
  /** Why a section is null. A missing key means the section is present. */
  unavailable: OmadaUnavailable;
};

export const OMADA_ID_PATTERN = /^[A-Za-z0-9]{8,64}$/;
export const DEVICE_PAGE_SIZE = 50;
export const DEVICE_MAX_PAGES = 20;
export const ALERT_PAGE_SIZE = 10;
export const ALERT_WINDOW_HOURS = 24;
export const SITE_PAGE_SIZE = 50;
export const SITE_MAX_PAGES = 20;
/** The Controller's `errorCode` values observed for an invalid credential or authorization header. */
export const AUTH_ERROR_CODES: readonly number[] = [-44106, -44112];

export class OmadaInvalid extends Error {
  constructor() {
    super('Invalid response from Omada.');
    this.name = 'OmadaInvalid';
  }
}
const invalid = () => new OmadaInvalid();
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
const count = (value: unknown, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
    throw invalid();
  return value;
};

/** Returns `result` of a successful envelope; the code is read even when the HTTP status is 200. */
export function parseEnvelope(body: unknown): { errorCode: number; result: unknown } {
  const envelope = record(body);
  const code = envelope.errorCode;
  if (typeof code !== 'number' || !Number.isSafeInteger(code) || Math.abs(code) > 1_000_000)
    throw invalid();
  return { errorCode: code, result: envelope.result };
}
function successResult(body: unknown): Record<string, unknown> {
  const { errorCode, result } = parseEnvelope(body);
  if (errorCode !== 0) throw invalid();
  return record(result);
}

export type Page = { totalRows: number; rows: unknown[] };
/** A grid page: `totalRows`, the requested page number, and at most `pageSize` rows. */
export function parsePage(body: unknown, page: number, pageSize: number): Page {
  const result = successResult(body);
  const totalRows = count(result.totalRows);
  const rows = result.data;
  if (!Array.isArray(rows) || rows.length > pageSize) throw invalid();
  if (result.currentPage !== undefined && result.currentPage !== page) throw invalid();
  // Every page before the last is full, and the last one holds exactly the remainder.
  if (rows.length !== Math.min(pageSize, Math.max(0, totalRows - (page - 1) * pageSize)))
    throw invalid();
  return { totalRows, rows };
}

/** Site IDs of one page of `GET /sites`; identifiers are only compared, never returned. */
export function parseSiteIds(body: unknown, page: number): { totalRows: number; ids: string[] } {
  const parsed = parsePage(body, page, SITE_PAGE_SIZE);
  const ids = parsed.rows.map((row) => {
    const id = record(row).siteId;
    if (typeof id !== 'string' || !OMADA_ID_PATTERN.test(id)) throw invalid();
    return id;
  });
  return { totalRows: parsed.totalRows, ids };
}

export function parseClients(
  body: unknown,
  pageSize = 1,
): { total: number; wired: number; wireless: number } {
  const result = successResult(body);
  if (!Array.isArray(result.data) || result.data.length > pageSize) throw invalid();
  const stat = record(result.clientStat);
  const total = count(stat.total);
  const wired = count(stat.wired);
  const wireless = count(stat.wireless);
  // The two kinds can never outnumber all clients; a larger sum means the semantics differ.
  if (wired > total || wireless > total || wired + wireless > total) throw invalid();
  return { total, wired, wireless };
}

/** The history switches: both on is enabled, both off is disabled, anything else is unknown. */
export function parseCollection(body: unknown): OmadaCollection {
  try {
    const result = successResult(body);
    const { clientStatEnable: stat, clientsDataEnable: data } = result;
    if (typeof stat !== 'boolean' || typeof data !== 'boolean') return 'unknown';
    return stat && data ? 'enabled' : !stat && !data ? 'disabled' : 'unknown';
  } catch {
    return 'unknown';
  }
}

const emptyGroup = (): OmadaDeviceGroup => ({
  total: 0,
  connected: 0,
  disconnected: 0,
  pending: 0,
  heartbeatMissed: 0,
  isolated: 0,
  unknown: 0,
});
const STATUS_KEYS = [
  'disconnected',
  'connected',
  'pending',
  'heartbeatMissed',
  'isolated',
] as const;
export const emptyDevices = (): OmadaDevices => ({
  ap: emptyGroup(),
  switch: emptyGroup(),
  gateway: emptyGroup(),
  other: 0,
});

/** Device MACs of one page, used only to detect duplicates, plus their type and raw status. */
export function parseDevicePage(
  body: unknown,
  page: number,
): { totalRows: number; devices: { mac: string; type: string; status: unknown }[] } {
  const parsed = parsePage(body, page, DEVICE_PAGE_SIZE);
  const devices = parsed.rows.map((row) => {
    const device = record(row);
    const { mac, type, status } = device;
    if (typeof mac !== 'string' || mac.length === 0 || mac.length > 64) throw invalid();
    if (typeof type !== 'string' || type.length > 32) throw invalid();
    return { mac: mac.toLowerCase(), type: type.toLowerCase(), status };
  });
  return { totalRows: parsed.totalRows, devices };
}

/** Adds devices to the counts. Documented status 1 is connected; 0, 2, 3 and 4 stay distinct. */
export function addDevices(
  summary: OmadaDevices,
  devices: readonly { type: string; status: unknown }[],
) {
  for (const { type, status } of devices) {
    if (type !== 'ap' && type !== 'switch' && type !== 'gateway') {
      summary.other++;
      continue;
    }
    const group = summary[type];
    group.total++;
    const key =
      typeof status === 'number' && Number.isInteger(status) ? STATUS_KEYS[status] : undefined;
    group[key ?? 'unknown']++;
  }
}

export function parseAlerts(
  body: unknown,
  window: { start: number; end: number },
): { unresolved: number; windowHours: 24 } {
  const parsed = parsePage(body, 1, ALERT_PAGE_SIZE);
  for (const row of parsed.rows) {
    const entry = record(row);
    // The filter is not honoured when a resolved alert comes back, or when a millisecond
    // timestamp falls outside the requested window; the count is then not trustworthy.
    if (entry.resolved === true) throw invalid();
    const time = entry.time;
    if (
      typeof time === 'number' &&
      time >= 1e12 &&
      (time < window.start - 60_000 || time > window.end + 60_000)
    )
      throw invalid();
  }
  return { unresolved: parsed.totalRows, windowHours: ALERT_WINDOW_HOURS };
}

/** Validates the adapter output for presentation; null when it is not a summary. */
export function parseSummary(value: unknown): OmadaSummary | null {
  try {
    const input = record(value);
    const unavailable = record(input.unavailable ?? {});
    const collection = input.clientCollection;
    if (collection !== 'enabled' && collection !== 'disabled' && collection !== 'unknown')
      return null;
    let clients: OmadaSummary['clients'] = null;
    if (input.clients !== null) {
      const c = record(input.clients);
      clients = { total: count(c.total), wired: count(c.wired), wireless: count(c.wireless) };
    }
    let devices: OmadaDevices | null = null;
    if (input.devices !== null) {
      const d = record(input.devices);
      const group = (raw: unknown): OmadaDeviceGroup => {
        const g = record(raw);
        const out = emptyGroup();
        for (const key of Object.keys(out) as (keyof OmadaDeviceGroup)[]) out[key] = count(g[key]);
        return out;
      };
      devices = {
        ap: group(d.ap),
        switch: group(d.switch),
        gateway: group(d.gateway),
        other: count(d.other),
      };
    }
    let alerts: OmadaSummary['alerts'] = null;
    if (input.alerts !== null) {
      const a = record(input.alerts);
      if (a.windowHours !== ALERT_WINDOW_HOURS) return null;
      alerts = { unresolved: count(a.unresolved), windowHours: ALERT_WINDOW_HOURS };
    }
    return {
      clients,
      clientCollection: collection,
      devices,
      alerts,
      unavailable: unavailable as OmadaUnavailable,
    };
  } catch {
    return null;
  }
}
