/** A safe key in the monitor vocabulary; never expose raw errors or response content. */
export function monitoringReasonKey(
  reason: string | null | undefined,
  httpStatus?: number | null,
): string {
  switch (reason) {
    case 'destination-blocked':
    case 'no-response':
    case 'not-found':
    case 'content-mismatch':
    case 'cert-expired':
    case 'cert-invalid':
    case 'cert-expiring':
    case 'maintenance':
      return `uptime.reason.${reason}`;
    case 'error-status':
    case 'unexpected-status':
      return `uptime.reason.${reason}${typeof httpStatus === 'number' ? '' : '-generic'}`;
    default:
      return 'uptime.reason.other';
  }
}
