import { defineWidget } from '../../index.js';
import {
  monitoringSources,
  orderMonitoringProblems,
  type MonitoringProblem,
} from '../../monitoring.js';

export type ProblemsConfig = {
  limit: number;
  pages: string[];
  groups: string[];
  includeDegraded: boolean;
};

export const defaultProblemsConfig: ProblemsConfig = {
  limit: 5,
  pages: [],
  groups: [],
  includeDegraded: true,
};

export const widgetProblemsWidget = defineWidget<ProblemsConfig>({
  type: 'current-problems',
  version: 1,
  locations: ['page'],
  source: monitoringSources.problems,
  portable: true,
  defaultConfig: defaultProblemsConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (
      Object.keys(config).some(
        (key) => !['limit', 'pages', 'groups', 'includeDegraded'].includes(key),
      )
    )
      return null;
    const names = (input: unknown): input is string[] =>
      Array.isArray(input) &&
      input.length <= 100 &&
      input.every(
        (name) =>
          typeof name === 'string' && name.trim() === name && name.length > 0 && name.length <= 200,
      ) &&
      new Set(input).size === input.length &&
      JSON.stringify(input).length <= 4000;
    if (
      !Number.isInteger(config.limit) ||
      (config.limit as number) < 1 ||
      (config.limit as number) > 10 ||
      !names(config.pages) ||
      !names(config.groups) ||
      typeof config.includeDegraded !== 'boolean'
    )
      return null;
    return {
      limit: config.limit as number,
      pages: config.pages,
      groups: config.groups,
      includeDegraded: config.includeDegraded,
    };
  },
});

/** Sort before limiting; unknown start times follow known ones. */
export function selectProblems(items: MonitoringProblem[], config: ProblemsConfig) {
  const ordered = orderMonitoringProblems(
    items.filter((item) => config.includeDegraded || item.state !== 'degraded'),
  );
  return { items: ordered.slice(0, config.limit), total: ordered.length };
}
