import { createHash } from 'node:crypto';
import type { MonitoringService } from './service-source.js';
import { resolveCheckTarget } from './target.js';

/**
 * Identifies the monitoring-relevant configuration of a service so results from an old
 * configuration are not attributed to edited settings. It only needs to detect change, not
 * resist attacks, so a 16-character (64-bit) prefix of the SHA-256 hex is stored; the value
 * is repeated in the history row and two indexes, so its length dominates the row size.
 */
export const SIGNATURE_LENGTH = 16;
export function serviceSignature(
  service: Pick<
    MonitoringService,
    | 'url'
    | 'allowPrivate'
    | 'checkInsecure'
    | 'checkType'
    | 'checkInterval'
    | 'expectedStatus'
    | 'checkPath'
    | 'checkUrl'
    | 'checkMatch'
  >,
  caHash?: string,
) {
  // Invalid stored targets still get a stable signature; the probe reports the error per monitor.
  let target: string;
  try {
    target = resolveCheckTarget(service);
  } catch {
    target = JSON.stringify([service.url, service.checkUrl, service.checkPath]);
  }
  return createHash('sha256')
    .update(
      JSON.stringify([
        target,
        Boolean(service.allowPrivate),
        service.checkType ?? 'http',
        service.checkInterval ?? null,
        service.expectedStatus ?? null,
        ...(service.checkMatch ? [service.checkMatch] : []),
        ...(service.checkInsecure ? [{ checkInsecure: true }] : []),
        ...(caHash &&
        service.allowPrivate &&
        !service.checkInsecure &&
        ['http', 'tls'].includes(service.checkType ?? 'http')
          ? [{ caHash }]
          : []),
      ]),
    )
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH);
}
