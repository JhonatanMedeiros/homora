import type { Config } from './definition.js';
export type Resource = {
  uuid: string;
  name: string;
  type: 'application' | 'service';
  state: 'running' | 'degraded' | 'stopped' | 'unknown';
  rawStatus: string | null;
  urls: string[];
};
export function parseResources(value: unknown): Resource[] | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('resources' in value) ||
    !Array.isArray(value.resources) ||
    value.resources.length > 1000
  )
    return null;
  const rows: Resource[] = [];
  const seen = new Set<string>();
  for (const item of value.resources) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.uuid !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(item.uuid) ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 256 ||
      seen.has(item.uuid) ||
      !['application', 'service'].includes(item.type) ||
      !['running', 'degraded', 'stopped', 'unknown'].includes(item.state) ||
      !(
        item.rawStatus === null ||
        (typeof item.rawStatus === 'string' && item.rawStatus.length <= 64)
      ) ||
      !Array.isArray(item.urls)
    )
      return null;
    const urls = item.urls
      .filter((url: unknown): url is string => {
        if (typeof url !== 'string' || url.length > 2048) return false;
        try {
          const parsed = new URL(url);
          return (
            ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
          );
        } catch {
          return false;
        }
      })
      .slice(0, 5);
    seen.add(item.uuid);
    rows.push({
      uuid: item.uuid,
      name: item.name,
      type: item.type,
      state: item.state,
      rawStatus: item.rawStatus,
      urls,
    });
  }
  return rows;
}
export function selectResources(rows: Resource[], config: Config) {
  const order = { stopped: 0, degraded: 1, unknown: 2, running: 3 };
  const filtered = rows
    .filter(
      (r) =>
        (config.type === 'all' || r.type === config.type) &&
        (config.state === 'all' || r.state === config.state),
    )
    .sort((a, b) => order[a.state] - order[b.state]);
  return { rows: filtered.slice(0, config.limit), total: filtered.length };
}
