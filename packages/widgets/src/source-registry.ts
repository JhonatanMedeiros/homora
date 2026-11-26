import type { WidgetSourceReader } from './source.js';
import { healthchecksJobsSource } from './widgets/healthchecks-jobs/source.js';
import { domainExpirySource } from './widgets/domain-expiry/source.js';
import { publicIpSource } from './widgets/public-ip/source.js';
import { rssFeedSource } from './widgets/rss-feed/source.js';
import { homeAssistantEntitiesSource } from './widgets/home-assistant-entities/source.js';

const sources: Record<string, WidgetSourceReader<unknown, unknown>> = {
  [healthchecksJobsSource.contract]: healthchecksJobsSource as WidgetSourceReader<unknown, unknown>,
  [domainExpirySource.contract]: domainExpirySource as WidgetSourceReader<unknown, unknown>,
  [rssFeedSource.contract]: rssFeedSource as WidgetSourceReader<unknown, unknown>,
  [homeAssistantEntitiesSource.contract]: homeAssistantEntitiesSource as WidgetSourceReader<
    unknown,
    unknown
  >,
  [publicIpSource.contract]: publicIpSource as WidgetSourceReader<unknown, unknown>,
};

export function getWidgetSource(
  contract: string,
): WidgetSourceReader<unknown, unknown> | undefined {
  return Object.hasOwn(sources, contract) ? sources[contract] : undefined;
}

export function listWidgetSources(): readonly WidgetSourceReader<unknown, unknown>[] {
  return Object.values(sources);
}
