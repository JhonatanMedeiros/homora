export type Availability = 'available' | 'unavailable' | 'unknown';

/** Health probe status reason from monitor; absent in responses from older versions. */
export type StatusReason =
  | 'responding'
  | 'redirect'
  | 'login-required'
  | 'unexpected-status'
  | 'not-found'
  | 'error-status'
  | 'reachable'
  | 'destination-blocked'
  | 'no-response'
  | 'content-mismatch'
  | 'cert-expired'
  | 'cert-invalid'
  | 'cert-expiring'
  | 'maintenance'
  | 'unchecked';

export type ServiceStatus = {
  status: Availability;
  lastAttempt: string | null;
  reason?: StatusReason;
  httpStatus?: number | null;
  latencyMs?: number | null;
  expectedStatus?: string | null;
  /** TLS checks: when the certificate expires (epoch milliseconds). */
  certExpiresAt?: number;
};
