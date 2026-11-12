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
    'url' | 'allowPrivate' | 'checkType' | 'checkInterval' | 'expectedStatus' | 'checkPath'
  >,
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
      ]),
    )
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH);
}
