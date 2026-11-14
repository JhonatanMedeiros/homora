import {
  CHECK_INTERVAL_MAX,
  CHECK_INTERVAL_MIN,
  isCheckMatch,
  isCheckType,
  isCheckUrl,
  isExpectedStatus,
  type CheckType,
} from './services.js';

/**
 * A probe is something Homora monitors that has no dashboard card: a WAN address, an internal DNS
 * name, a TCP port. It is a monitor on its own, so it is checked, charted, alerted on and published
 * exactly like a card's monitor.
 *
 * The address is always an `http(s)://host[:port]` URL, the same shape a card's monitoring address
 * has: a TCP probe of port 8080 is written `http://host:8080`, a ping or DNS probe `http://host`.
 */
export type ProbeInput = {
  name: string;
  address: string;
  checkType?: CheckType;
  /** Seconds between checks; null restores the default. */
  checkInterval?: number | null;
  expectedStatus?: string | null;
  checkMatch?: string | null;
  allowPrivate?: boolean;
};

export type Probe = Required<Omit<ProbeInput, 'checkType'>> & {
  id: number;
  checkType: CheckType;
  /** Shown on the public status page. */
  isPublic: boolean;
};

export const PROBE_NAME_MAX = 80;
/** Group a probe appears under on the public status page. */
export const PROBES_GROUP = 'Connectivity';

export class ProbeValidationError extends Error {
  constructor(readonly code: 'invalid-name' | 'invalid-address' | 'invalid-option') {
    super(
      code === 'invalid-name'
        ? 'Provide a name.'
        : code === 'invalid-address'
          ? 'Provide an HTTP or HTTPS address without credentials, query or fragment.'
          : 'One of the check options is not valid.',
    );
  }
}

/** Normalizes a probe form; throws `ProbeValidationError` with a stable code. */
export function validateProbe(input: Partial<ProbeInput>): Required<ProbeInput> {
  const name = String(input.name ?? '').trim();
  if (!name || name.length > PROBE_NAME_MAX) throw new ProbeValidationError('invalid-name');
  if (!isCheckUrl(input.address)) throw new ProbeValidationError('invalid-address');
  const checkType = input.checkType ?? 'http';
  if (!isCheckType(checkType)) throw new ProbeValidationError('invalid-option');
  const interval = input.checkInterval ?? null;
  if (
    interval !== null &&
    !(
      Number.isSafeInteger(interval) &&
      interval >= CHECK_INTERVAL_MIN &&
      interval <= CHECK_INTERVAL_MAX
    )
  )
    throw new ProbeValidationError('invalid-option');
  const expectedStatus = input.expectedStatus ?? null;
  if (expectedStatus !== null && !isExpectedStatus(expectedStatus))
    throw new ProbeValidationError('invalid-option');
  const checkMatch = input.checkMatch ?? null;
  if (checkMatch !== null && !isCheckMatch(checkMatch))
    throw new ProbeValidationError('invalid-option');
  return {
    name,
    address: normalizeAddress(input.address),
    checkType,
    checkInterval: interval,
    expectedStatus: expectedStatus === null ? null : String(expectedStatus),
    checkMatch,
    allowPrivate: input.allowPrivate === true,
  };
}

/** `http://host/` and `http://host` are the same address; keep the shorter spelling. */
function normalizeAddress(address: string) {
  const url = new URL(address);
  return url.pathname === '/' ? url.href.slice(0, -1) : url.href;
}
