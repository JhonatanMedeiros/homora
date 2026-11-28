import {
  Activity,
  Bot,
  ChartColumn,
  Gauge,
  Grid3x3,
  Server,
  Star,
  Timer,
  TriangleAlert,
  Wrench,
  Radar,
  type LucideIcon,
} from 'lucide-react';
import { summaryWidgets, summaryWidgetTypes, type SummaryWidgetType } from '../summary.js';
import type { WidgetUI } from './types.js';

const icons: Record<SummaryWidgetType, LucideIcon> = {
  'summary-pinned': Star,
  'summary-attention': TriangleAlert,
  'summary-services': Grid3x3,
  'summary-hosts': Server,
  'summary-probes': Radar,
  'summary-figures': ChartColumn,
  'summary-proposals': Bot,
  'summary-status': Activity,
  'summary-availability': Gauge,
  'summary-latency': Timer,
  'summary-maintenance': Wrench,
};

function summaryWidgetUI(type: SummaryWidgetType): WidgetUI {
  const key = `summaryWidgets.${type.slice('summary-'.length)}`;
  const Icon = icons[type];
  return {
    name: key,
    description: `${key}Desc`,
    category: 'overview',
    keywords: ['summary', 'overview', 'resumo'],
    defaultConfig: {},
    parse: summaryWidgets[type].parseConfig,
    // The application draws these on the Summary, from the health it has already read.
    View: () => null,
    Editor: () => null,
    Gallery: () => <Icon aria-hidden="true" />,
  };
}

export const summaryWidgetUIs = Object.fromEntries(
  summaryWidgetTypes.map((type) => [type, summaryWidgetUI(type)]),
) as Record<SummaryWidgetType, WidgetUI>;
