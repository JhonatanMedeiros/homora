import type { MonitoringService } from './service-source.js';
import { isNonHttp } from './probe.js';

/** Resolve the address actually checked, including the card's optional path override. */
export function resolveCheckTarget(
  service: Pick<MonitoringService, 'url' | 'checkUrl' | 'checkPath' | 'checkType'>,
): string {
  if (!service.checkUrl && !service.url) throw new Error('Monitor has no check target');
  return (
    service.checkUrl ??
    (!isNonHttp(service.checkType) && service.checkPath
      ? new URL(service.checkPath, new URL(service.url!).origin).href
      : service.url!)
  );
}
