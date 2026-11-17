import { defineWidget, monitoringSources } from '../../index.js';

export type MaintenanceConfig = {
  days: 1 | 7 | 30;
  limit: number;
  pages: string[];
  groups: string[];
};
export const defaultMaintenanceConfig: MaintenanceConfig = {
  days: 7,
  limit: 5,
  pages: [],
  groups: [],
};
const names = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every(
    (name) =>
      typeof name === 'string' && name.length > 0 && name.length <= 100 && name.trim() === name,
  ) &&
  new Set(value).size === value.length &&
  JSON.stringify(value).length <= 4000;
export const widgetMaintenanceScheduleWidget = defineWidget<MaintenanceConfig>({
  type: 'maintenance-schedule',
  version: 1,
  locations: ['page'],
  source: monitoringSources.maintenance,
  portable: true,
  sizes: ['normal', 'wide'],
  defaultConfig: defaultMaintenanceConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const c = value as Record<string, unknown>;
    if (
      Object.keys(c).some((key) => !['days', 'limit', 'pages', 'groups'].includes(key)) ||
      (c.days !== 1 && c.days !== 7 && c.days !== 30) ||
      !Number.isInteger(c.limit) ||
      (c.limit as number) < 1 ||
      (c.limit as number) > 10 ||
      !names(c.pages) ||
      !names(c.groups)
    )
      return null;
    return { days: c.days, limit: c.limit as number, pages: c.pages, groups: c.groups };
  },
});
