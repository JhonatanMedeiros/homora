import { ExternalLink, Rss } from 'lucide-react';
import { Checkbox } from '@homora/ui/checkbox';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@homora/ui/empty';
import { Field, FieldDescription, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { Skeleton } from '@homora/ui/skeleton';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
  MAX_FEED_TITLE_LENGTH,
  MAX_FEED_URL_LENGTH,
  defaultRssFeedConfig,
  widgetRssFeedWidget,
  type RssFeedConfig,
} from '../definition.js';
import { useFeedReading, type FeedReading } from './use-feed-reading.js';

export function RssFeedView({ config }: { config: RssFeedConfig }) {
  const { readFeed } = useWidgetHost();
  const reading = useFeedReading(
    {
      feedUrl: config.feedUrl,
      limit: config.limit,
      allowPrivateNetwork: config.allowPrivateNetwork,
    },
    readFeed,
  );
  return <RssFeedContent config={config} reading={reading} />;
}

export function RssFeedContent({
  config,
  reading,
}: {
  config: RssFeedConfig;
  reading: FeedReading;
}) {
  const { t, locale, wide } = useWidgetHost();

  if (reading.status === 'unconfigured') {
    return <p className="text-sm text-muted-foreground">{t('rssWidget.unconfigured')}</p>;
  }

  if (reading.status === 'loading') {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('rssWidget.loading')}</span>
        <div aria-hidden="true" className="flex flex-col gap-2.5">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex flex-col gap-1.5 py-1">
              <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-1/3 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (reading.status === 'policy-blocked') {
    return (
      <p role="alert" className="text-sm break-words text-destructive">
        {t('rssWidget.policyBlocked')}
      </p>
    );
  }

  if (reading.status === 'error') {
    return (
      <p role="alert" className="text-sm break-words text-destructive">
        {t('rssWidget.error')}
      </p>
    );
  }

  const { data, stale } = reading;
  const heading = config.title.trim() || data.feedTitle;
  const dateFormatter = new Intl.DateTimeFormat(
    locale,
    wide ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' },
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {heading && (
        <p className="truncate text-xs font-medium text-muted-foreground" title={heading}>
          {heading}
        </p>
      )}
      {stale && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('rssWidget.stale')}
        </p>
      )}
      {data.entries.length === 0 ? (
        <Empty className="gap-2 p-3 md:p-3">
          <EmptyHeader>
            <EmptyMedia>
              <Rss aria-hidden="true" className="size-5 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle className="text-sm">{t('rssWidget.empty')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex min-w-0 flex-col divide-y">
          {data.entries.map((entry) => {
            const formattedDate =
              entry.publishedAt === null
                ? t('rssWidget.noDate')
                : dateFormatter.format(entry.publishedAt);
            const content = (
              <span
                className={
                  wide
                    ? 'flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3'
                    : 'flex min-w-0 flex-1 flex-col gap-0.5'
                }
              >
                <span className="min-w-0 break-words text-sm font-medium">{entry.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {entry.publishedAt === null ? (
                    formattedDate
                  ) : (
                    <time dateTime={new Date(entry.publishedAt).toISOString()}>
                      {formattedDate}
                    </time>
                  )}
                </span>
              </span>
            );
            return (
              <li key={entry.id} className="min-w-0 py-1.5 first:pt-0 last:pb-0">
                {entry.link ? (
                  <a
                    href={entry.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('rssWidget.openEntry', { title: entry.title })}
                    className="group/link flex min-h-10 min-w-0 items-start justify-between gap-2 rounded-sm px-1 py-1 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {content}
                    <ExternalLink
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover/link:opacity-100"
                    />
                  </a>
                ) : (
                  <div className="flex min-h-10 min-w-0 items-start px-1 py-1">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Editor({
  config,
  onChange,
}: {
  config: RssFeedConfig;
  onChange: (config: RssFeedConfig) => void;
}) {
  const { t } = useWidgetHost();
  return (
    <>
      <Field>
        <FieldLabel htmlFor="rss-feed-url">{t('rssWidget.feedUrl')}</FieldLabel>
        <Input
          id="rss-feed-url"
          type="url"
          required
          maxLength={MAX_FEED_URL_LENGTH}
          placeholder={t('rssWidget.feedUrlPlaceholder')}
          value={config.feedUrl}
          onChange={(event) => onChange({ ...config, feedUrl: event.target.value })}
        />
        <FieldDescription>{t('rssWidget.feedUrlHint')}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="rss-feed-title">{t('rssWidget.title')}</FieldLabel>
        <Input
          id="rss-feed-title"
          type="text"
          maxLength={MAX_FEED_TITLE_LENGTH}
          placeholder={t('rssWidget.titlePlaceholder')}
          value={config.title}
          onChange={(event) => onChange({ ...config, title: event.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="rss-feed-limit">{t('rssWidget.limit')}</FieldLabel>
        <Input
          id="rss-feed-limit"
          type="number"
          min={1}
          max={MAX_FEED_LIMIT}
          step={1}
          value={config.limit}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            const nextLimit = Number.isNaN(parsed)
              ? DEFAULT_FEED_LIMIT
              : Math.min(MAX_FEED_LIMIT, Math.max(1, parsed));
            onChange({ ...config, limit: nextLimit });
          }}
        />
      </Field>
      <Field>
        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox
            id="rss-feed-allow-private"
            checked={config.allowPrivateNetwork}
            onCheckedChange={(checked) =>
              onChange({ ...config, allowPrivateNetwork: checked === true })
            }
          />
          <span className="leading-snug">{t('rssWidget.allowPrivateNetwork')}</span>
        </label>
        <FieldDescription>{t('rssWidget.allowPrivateNetworkHint')}</FieldDescription>
      </Field>
    </>
  );
}

export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetRssFeed',
  description: 'pageWidgets.widgetRssFeedDesc',
  defaultConfig: defaultRssFeedConfig,
  parse: widgetRssFeedWidget.parseConfig,
  View: ({ config }) => <RssFeedView config={config as RssFeedConfig} />,
  Editor: ({ config, onChange }) => <Editor config={config as RssFeedConfig} onChange={onChange} />,
  Gallery: () => <Rss aria-hidden="true" />,
  canSubmit: (config) => widgetRssFeedWidget.parseConfig(config) !== null,
};
