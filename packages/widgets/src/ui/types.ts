import type { ComponentType } from 'react';
import type { MonitoringQuery } from './host.js';
export type WidgetCategory = 'overview' | 'time' | 'monitoring' | 'feeds' | 'utilities';

export type WidgetUI = {
  name: string;
  description: string;
  category?: WidgetCategory;
  keywords?: readonly string[];
  defaultConfig: unknown;
  parse: (config: unknown) => unknown | null;
  monitoringQuery?: (config: unknown) => MonitoringQuery;
  View: ComponentType<{ config: unknown }>;
  Editor: ComponentType<{ config: unknown; onChange: (config: unknown) => void }>;
  Gallery: ComponentType;
  Preview?: ComponentType<{ config: unknown; name: string }>;
  canSubmit?: (config: unknown) => boolean;
  isHidden?: (config: unknown, now: Date) => boolean;
};
