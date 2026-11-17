import { createContext, useContext, type ReactNode } from 'react';

export type WidgetHost = {
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
};
const HostContext = createContext<WidgetHost | null>(null);
export function WidgetHostProvider({
  value,
  children,
}: {
  value: WidgetHost;
  children: ReactNode;
}) {
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
}
export function useWidgetHost(): WidgetHost {
  const host = useContext(HostContext);
  if (!host) throw new Error('WidgetHostProvider is missing');
  return host;
}

export type { WidgetUI } from './types.js';
