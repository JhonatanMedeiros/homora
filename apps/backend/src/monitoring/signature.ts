import { createHash } from 'node:crypto';
import type { Service } from '@homora/shared';

/**
 * Identifies the monitoring-relevant configuration of a service so results from an old
 * configuration are not attributed to edited settings. It only needs to detect change, not
 * resist attacks, so a 16-character (64-bit) prefix of the SHA-256 hex is stored; the value
 * is repeated in the history row and two indexes, so its length dominates the row size.
 */
export const SIGNATURE_LENGTH = 16;
export function serviceSignature(
  service: Pick<
    Service,
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
  return createHash('sha256')
    .update(
      JSON.stringify([
        service.url,
        Boolean(service.allowPrivate),
        service.checkType ?? 'http',
        service.checkInterval ?? null,
        service.expectedStatus ?? null,
        service.checkPath ?? null,
        // Appended only when set, so services without it keep the signature (and history) they had.
        ...(service.checkMatch ? [service.checkMatch] : []),
        ...(service.checkUrl ? [{ checkUrl: service.checkUrl }] : []),
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
