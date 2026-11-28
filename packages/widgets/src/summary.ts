/**
 * The widgets of the application's own health: what the Summary of a page shows from the start.
 * They read nothing themselves; the application draws them from what it already knows.
 */
import { defineWidget, type SummaryPlacement } from './index.js';

type EmptyConfig = Record<string, never>;

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

function summaryWidget(type: SummaryWidgetType) {
  return defineWidget<EmptyConfig>({
    type,
    version: 1,
    locations: ['page'],
    source: null,
    portable: true,
    summaryOnly: true,
    summary: placements[type],
    defaultConfig: {},
    parseConfig: (value) =>
      value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
        ? {}
        : null,
  });
}

export const summaryWidgets = Object.fromEntries(
  summaryWidgetTypes.map((type) => [type, summaryWidget(type)]),
) as Record<SummaryWidgetType, ReturnType<typeof summaryWidget>>;

export const isSummaryWidgetType = (type: string): type is SummaryWidgetType =>
  (summaryWidgetTypes as readonly string[]).includes(type);
