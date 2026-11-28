/**
 * The widgets of the application's own health: what the Summary of a page shows from the start.
 * They read nothing themselves; the application draws them from what it already knows. Some can be
 * narrowed to part of the installation; an empty configuration shows everything.
 */
import { defineWidget, type SummaryPlacement } from './index.js';

/** In the default reading order of wide screens. */
export const summaryWidgetTypes = [
  'summary-pinned',
  'summary-attention',
  'summary-services',
  'summary-hosts',
  'summary-probes',
  'summary-figures',
  'summary-proposals',
  'summary-status',
  'summary-availability',
  'summary-latency',
  'summary-maintenance',
] as const;
export type SummaryWidgetType = (typeof summaryWidgetTypes)[number];

const placement = (
  width: number,
  height: number,
  minWidth: number,
  minHeight: number,
): SummaryPlacement => ({ width, height, minWidth, minHeight });

const placements: Record<SummaryWidgetType, SummaryPlacement> = {
  'summary-pinned': placement(12, 1, 4, 1),
  'summary-attention': placement(8, 6, 6, 2),
  'summary-services': placement(4, 2, 3, 1),
  'summary-hosts': placement(4, 2, 3, 2),
  'summary-probes': placement(4, 4, 3, 2),
  'summary-figures': placement(8, 1, 4, 1),
  'summary-proposals': placement(4, 1, 3, 1),
  'summary-status': placement(8, 1, 4, 1),
  'summary-availability': placement(4, 4, 3, 2),
  'summary-latency': placement(4, 4, 4, 2),
  'summary-maintenance': placement(8, 2, 4, 1),
};

/** What a widget can be narrowed to, by name, so a configuration stays portable. */
export type SummaryOption = 'groups' | 'pages' | 'probes';
export type SummaryConfig = Partial<Record<SummaryOption, string[]>>;

const scope = ['groups', 'pages'] as const;
/** Figures, availability and proposals read installation totals, so they have nothing to choose. */
export const summaryOptions: Record<SummaryWidgetType, readonly SummaryOption[]> = {
  'summary-pinned': scope,
  'summary-attention': scope,
  'summary-services': scope,
  'summary-hosts': scope,
  'summary-probes': ['probes'],
  'summary-figures': [],
  'summary-proposals': [],
  'summary-status': scope,
  'summary-availability': [],
  'summary-latency': scope,
  'summary-maintenance': scope,
};

const isNames = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 200) &&
  new Set(value).size === value.length;

/** Empty choices are left out, so "everything" is always stored as `{}`. */
function parseSummaryConfig(options: readonly SummaryOption[], value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !(options as readonly string[]).includes(key))) return null;
  const config: SummaryConfig = {};
  for (const option of options) {
    const names = input[option];
    if (names === undefined) continue;
    if (!isNames(names)) return null;
    if (names.length > 0) config[option] = [...names];
  }
  return config;
}

function summaryWidget(type: SummaryWidgetType) {
  return defineWidget<SummaryConfig>({
    type,
    version: 1,
    locations: ['page'],
    source: null,
    portable: true,
    summaryOnly: true,
    summary: placements[type],
    defaultConfig: {},
    parseConfig: (value) => parseSummaryConfig(summaryOptions[type], value),
  });
}

export const summaryWidgets = Object.fromEntries(
  summaryWidgetTypes.map((type) => [type, summaryWidget(type)]),
) as Record<SummaryWidgetType, ReturnType<typeof summaryWidget>>;

export const isSummaryWidgetType = (type: string): type is SummaryWidgetType =>
  (summaryWidgetTypes as readonly string[]).includes(type);
