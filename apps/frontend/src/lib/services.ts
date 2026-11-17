import type { Availability, ServiceInput, ServiceStatus, StatusReason } from '@homora/shared';
import { hostOf, isPrivateHost } from '@homora/utils';
import { formatDateTime } from '@/i18n';

export type { Availability, ServiceStatus, StatusReason };
export { hostOf, isPrivateHost };

export const emptyService: ServiceInput = {
  name: '',
  url: '',
  category: '',
  description: '',
  allowPrivate: false,
  checkType: 'http',
  checkInterval: null,
};

export type ServiceGroup = {
  id: number;
  name: string;
  position: number;
  /** Page (tab of the Home) the group is on. */
  pageId?: number;
  /** Grid columns on wide viewports (1 to 6); null falls back to automatic responsive grid. */
  columns?: number | null;
};
/** What the status light shows: an online service that is slower than its limit reads `degraded`. */
export type LightState = Availability | 'degraded' | 'maintenance';

export const formatAttempt = formatDateTime;

export const byPosition = <T extends { position?: number }>(a: T, b: T) =>
  (a.position ?? 0) - (b.position ?? 0);
