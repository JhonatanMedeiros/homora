import type { Config } from './definition.js';

export type Monitor = {
  id: number;
  name: string;
  group: string;
  status: 'up' | 'down' | 'pending' | 'maintenance' | 'unknown';
};

/** Treat integration observations as untrusted even when supplied by the host. */
export function parseMonitors(value: unknown): Monitor[] | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('monitors' in value) ||
    !Array.isArray(value.monitors) ||
    value.monitors.length > 50
  )
    return null;
  const rows: Monitor[] = [];
  for (const item of value.monitors) {
    if (
      !item ||
      typeof item !== 'object' ||
      !Number.isSafeInteger(item.id) ||
      item.id < 1 ||
      typeof item.name !== 'string' ||
      item.name.length > 256 ||
      typeof item.group !== 'string' ||
      item.group.length > 256 ||
      !['up', 'down', 'pending', 'maintenance', 'unknown'].includes(item.status)
    )
      return null;
    rows.push({ id: item.id, name: item.name, group: item.group, status: item.status });
  }
  return rows;
}
export function selectMonitors(monitors: Monitor[], config: Config) {
  const filtered = config.group
    ? monitors.filter((monitor) => monitor.group === config.group)
    : monitors;
  return { rows: filtered.slice(0, config.limit), total: filtered.length };
}
