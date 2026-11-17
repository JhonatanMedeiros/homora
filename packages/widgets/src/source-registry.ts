import type { WidgetSourceReader } from './source.js';
import { rssFeedSource } from './widgets/rss-feed/source.js';

const sources: Record<string, WidgetSourceReader<unknown, unknown>> = {
  [rssFeedSource.contract]: rssFeedSource as WidgetSourceReader<unknown, unknown>,
};

export function getWidgetSource(
  contract: string,
): WidgetSourceReader<unknown, unknown> | undefined {
  return Object.hasOwn(sources, contract) ? sources[contract] : undefined;
}

export function listWidgetSources(): readonly WidgetSourceReader<unknown, unknown>[] {
  return Object.values(sources);
}
