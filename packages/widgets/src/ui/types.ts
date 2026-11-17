import type { ComponentType } from 'react';
export type WidgetUI = {
  name: string;
  description: string;
  defaultConfig: unknown;
  parse: (config: unknown) => unknown | null;
  View: ComponentType<{ config: unknown }>;
  Editor: ComponentType<{ config: unknown; onChange: (config: unknown) => void }>;
  Gallery: ComponentType;
  Preview?: ComponentType<{ config: unknown; name: string }>;
  canSubmit?: (config: unknown) => boolean;
  isHidden?: (config: unknown, now: Date) => boolean;
};
