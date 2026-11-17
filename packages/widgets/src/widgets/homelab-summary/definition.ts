import { defineWidget } from '../../index.js';
import { monitoringSources, type MonitoringCounts } from '../../monitoring.js';

export type HomelabSummaryConfig = {
  showUnmeasured: boolean;
  groups: string[];
  pages: string[];
};
export const defaultHomelabSummaryConfig: HomelabSummaryConfig = {
  showUnmeasured: true,
  groups: [],
  pages: [],
};
export const widgetHomelabSummaryWidget = defineWidget<HomelabSummaryConfig>({
  type: 'homelab-summary',
  version: 1,
  locations: ['page'],
  source: monitoringSources.summary,
  portable: true,
  defaultConfig: defaultHomelabSummaryConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    const names = (input: unknown): input is string[] =>
      Array.isArray(input) &&
      input.length <= 100 &&
      input.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 200);
    if (
      Object.keys(config).some((key) => !['showUnmeasured', 'groups', 'pages'].includes(key)) ||
      typeof config.showUnmeasured !== 'boolean' ||
      !names(config.groups) ||
      !names(config.pages)
    )
      return null;
    return {
      showUnmeasured: config.showUnmeasured,
      groups: config.groups,
      pages: config.pages,
    };
  },
});

export function summarizeCounts(counts: MonitoringCounts) {
  const unmeasured = counts.unknown + counts.blocked;
  const total = counts.ok + counts.degraded + counts.down + counts.maintenance + unmeasured;
  return { ...counts, unmeasured, total, problems: counts.down + counts.degraded };
}

/** Resolve portable names against the current installation; missing names never broaden the scope. */
export function resolveSelection(
  names: string[],
  options: { id: number; name: string }[],
): number[] {
  if (names.length === 0) return [];
  const chosen = new Set(names);
  const ids = options.filter((option) => chosen.has(option.name)).map((option) => option.id);
  return ids.length > 0 ? ids : [0];
}
