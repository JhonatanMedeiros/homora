import type { MonitoringIncidents, MonitoringSummary, MonitoringProblems } from '../monitoring.js';
import { createContext, useContext, type ReactNode } from 'react';

export type MonitoringQuery = {
  days: number;
  limit: number;
  minimumMinutes: number;
  groups: string[];
  pages: string[];
};
export type MonitoringReading =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: MonitoringIncidents; stale: boolean };
export type MonitoringProblemsQuery = {
  limit: number;
  pages: string[];
  groups: string[];
  includeDegraded: boolean;
};
export type MonitoringProblemsReading =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: MonitoringProblems; stale: boolean; now: number };
export type WidgetScopeOptions = {
  pages: string[];
  groups: string[];
  error: boolean;
  loading: boolean;
};

export type FeedQuery = {
  feedUrl: string;
  limit: number;
  allowPrivateNetwork: boolean;
};

export type FeedEntry = {
  id: string;
  title: string;
  link: string | null;
  publishedAt: number | null;
};

export type FeedData = {
  feedTitle: string | null;
  entries: FeedEntry[];
  fetchedAt: number;
  stale: boolean;
};

export type WidgetSourceErrorCode = 'policy-blocked' | 'fetch-failed';

export class WidgetSourceError extends Error {
  code: WidgetSourceErrorCode;
  constructor(code: WidgetSourceErrorCode, message: string) {
    super(message);
    this.name = 'WidgetSourceError';
    this.code = code;
  }
}

export const FeedSourceError = WidgetSourceError;

export type WidgetSourceParams = Record<string, string | number | boolean | undefined>;

export type WidgetHost = {
  monitoring?: {
    readProblems?: (
      query: MonitoringProblemsQuery,
      signal: AbortSignal,
    ) => Promise<MonitoringProblems>;
    readSummary: (
      groups: number[],
      pages: number[],
      signal: AbortSignal,
    ) => Promise<MonitoringSummary>;
    readScopes: (
      signal: AbortSignal,
    ) => Promise<{ groups: { id: number; name: string }[]; pages: { id: number; name: string }[] }>;
    filterStatus?: (state: 'ok' | 'down' | 'degraded' | 'maintenance' | 'unmeasured') => void;
  };
  readSource?: <T = unknown>(
    contract: string,
    params: WidgetSourceParams,
    signal: AbortSignal,
  ) => Promise<T>;
  readFeed?: (query: FeedQuery, signal: AbortSignal) => Promise<FeedData>;

  locale: string;
  incidentReading?: MonitoringReading;
  openMonitor?: (id: number, hasService: boolean) => void;
  groups?: { name: string; pageId: number | null }[];
  pages?: { id: number; name: string }[];
  wide?: boolean;
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
