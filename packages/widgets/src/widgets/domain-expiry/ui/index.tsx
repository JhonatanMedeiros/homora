import { Globe, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Field, FieldDescription, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { Skeleton } from '@homora/ui/skeleton';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  DEFAULT_WARN_DAYS,
  MAX_DOMAINS,
  MAX_DOMAIN_LENGTH,
  MAX_DOMAIN_TITLE_LENGTH,
  MAX_WARN_DAYS,
  MIN_WARN_DAYS,
  defaultDomainExpiryConfig,
  parsePublicDomain,
  widgetDomainExpiryWidget,
  type DomainExpiryConfig,
} from '../definition.js';
import type { DomainExpiryEntry } from '../source.js';
import { useDomainExpiry, type DomainExpiryReading } from './use-domain-expiry.js';

const MS_PER_DAY = 86_400_000;

export function DomainExpiryView({ config }: { config: DomainExpiryConfig }) {
  const { readSource } = useWidgetHost();
  const reading = useDomainExpiry(config.domains, readSource);
  return <DomainExpiryContent config={config} reading={reading} />;
}

function classifyEntry(
  entry: DomainExpiryEntry,
  warnDays: number,
  now: number,
):
  | { kind: 'expired'; daysAgo: number }
  | { kind: 'soon'; daysLeft: number }
  | { kind: 'ok'; daysLeft: number }
  | { kind: 'unknown' | 'not-found' | 'error' | 'policy-blocked' } {
  if (entry.status !== 'ok' || entry.expiresAt === null) {
    return { kind: entry.status === 'ok' ? 'unknown' : entry.status };
  }
  const diffMs = entry.expiresAt - now;
  if (diffMs <= 0) {
    const daysAgo = Math.floor((now - entry.expiresAt) / MS_PER_DAY);
    return { kind: 'expired', daysAgo };
  }
  const daysLeft = Math.ceil(diffMs / MS_PER_DAY);
  if (daysLeft <= warnDays) {
    return { kind: 'soon', daysLeft };
  }
  return { kind: 'ok', daysLeft };
}

export function DomainExpiryContent({
  config,
  reading,
  now = Date.now(),
}: {
  config: DomainExpiryConfig;
  reading: DomainExpiryReading;
  now?: number;
}) {
  const { t, locale, wide } = useWidgetHost();

  if (reading.status === 'unconfigured') {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-sm text-muted-foreground">{t('domainExpiryWidget.unconfigured')}</p>
        <p className="text-xs text-muted-foreground">{t('domainExpiryWidget.sourceLabel')}</p>
      </div>
    );
  }

  if (reading.status === 'loading') {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('domainExpiryWidget.loading')}</span>
        <div aria-hidden="true" className="flex flex-col gap-2.5">
          {[0, 1].map((index) => (
            <div key={index} className="flex flex-col gap-1.5 py-1">
              <Skeleton className="h-4 w-3/4 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-1/2 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (reading.status === 'policy-blocked') {
    return (
      <p role="alert" className="text-sm break-words text-destructive">
        {t('domainExpiryWidget.policyBlocked')}
      </p>
    );
  }

  if (reading.status === 'error') {
    return (
      <p role="alert" className="text-sm break-words text-destructive">
        {t('domainExpiryWidget.error')}
      </p>
    );
  }

  const { data, stale } = reading;
  const heading = config.title.trim();
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        {heading ? (
          <p className="min-w-0 truncate text-xs font-medium text-muted-foreground" title={heading}>
            {heading}
          </p>
        ) : (
          <span />
        )}
        <p className="text-[11px] text-muted-foreground">{t('domainExpiryWidget.sourceLabel')}</p>
      </div>

      {stale && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('domainExpiryWidget.stale')}
        </p>
      )}

      <ul className="flex min-w-0 flex-col divide-y">
        {data.domains.map((entry) => {
          const state = classifyEntry(entry, config.warnDays, now);
          const formattedDate =
            entry.expiresAt === null ? null : dateFormatter.format(entry.expiresAt);

          let badgeVariant: 'destructive' | 'secondary' | 'outline';
          let badgeLabel: string;
          let detailText = '';

          if (state.kind === 'expired') {
            badgeVariant = 'destructive';
            badgeLabel = t('domainExpiryWidget.statusExpired');
            detailText =
              state.daysAgo === 0
                ? t('domainExpiryWidget.expiredToday')
                : t('domainExpiryWidget.expiredAgo', { days: state.daysAgo });
          } else if (state.kind === 'soon') {
            badgeVariant = 'secondary';
            badgeLabel = t('domainExpiryWidget.statusSoon');
            detailText =
              state.daysLeft === 0
                ? t('domainExpiryWidget.expiresToday')
                : t('domainExpiryWidget.daysRemaining', { days: state.daysLeft });
          } else if (state.kind === 'ok') {
            badgeVariant = 'outline';
            badgeLabel = t('domainExpiryWidget.statusOk');
            detailText = t('domainExpiryWidget.daysRemaining', { days: state.daysLeft });
          } else if (state.kind === 'not-found') {
            badgeVariant = 'outline';
            badgeLabel = t('domainExpiryWidget.statusNotFound');
            detailText = t('domainExpiryWidget.noExpiryDate');
          } else if (state.kind === 'policy-blocked') {
            badgeVariant = 'destructive';
            badgeLabel = t('domainExpiryWidget.statusPolicyBlocked');
          } else if (state.kind === 'error') {
            badgeVariant = 'destructive';
            badgeLabel = t('domainExpiryWidget.statusError');
          } else {
            badgeVariant = 'outline';
            badgeLabel = t('domainExpiryWidget.statusUnknown');
            detailText = t('domainExpiryWidget.noExpiryDate');
          }

          return (
            <li key={entry.domain} className="min-w-0 py-2 first:pt-0 last:pb-0">
              <div
                className={
                  wide
                    ? 'flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3'
                    : 'flex min-w-0 flex-col gap-1'
                }
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 break-all text-sm font-medium">{entry.domain}</span>
                  {!wide && (
                    <Badge variant={badgeVariant} className="shrink-0">
                      {badgeLabel}
                    </Badge>
                  )}
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {formattedDate && entry.expiresAt !== null && (
                    <time dateTime={new Date(entry.expiresAt).toISOString()}>{formattedDate}</time>
                  )}
                  {detailText && <span>{detailText}</span>}
                  {wide && (
                    <Badge variant={badgeVariant} className="shrink-0">
                      {badgeLabel}
                    </Badge>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Editor({
  config,
  onChange,
}: {
  config: DomainExpiryConfig;
  onChange: (config: DomainExpiryConfig) => void;
}) {
  const { t } = useWidgetHost();
  const rows = config.domains.length > 0 ? config.domains : [''];

  const updateRow = (index: number, value: string) => {
    const next = [...rows];
    next[index] = value;
    onChange({ ...config, domains: next });
  };

  const addRow = () => {
    if (rows.length >= MAX_DOMAINS) return;
    onChange({ ...config, domains: [...rows, ''] });
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) {
      onChange({ ...config, domains: [] });
      return;
    }
    onChange({ ...config, domains: rows.filter((_, i) => i !== index) });
  };

  return (
    <>
      <Field>
        <FieldLabel htmlFor="domain-expiry-title">{t('domainExpiryWidget.title')}</FieldLabel>
        <Input
          id="domain-expiry-title"
          type="text"
          maxLength={MAX_DOMAIN_TITLE_LENGTH}
          placeholder={t('domainExpiryWidget.titlePlaceholder')}
          value={config.title}
          onChange={(event) => onChange({ ...config, title: event.target.value })}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="domain-expiry-domain-0">
          {t('domainExpiryWidget.domains', { max: MAX_DOMAINS })}
        </FieldLabel>
        <div className="flex flex-col gap-2">
          {rows.map((domain, index) => {
            const trimmed = domain.trim();
            const isInvalid = trimmed.length > 0 && parsePublicDomain(trimmed) === null;
            return (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    id={`domain-expiry-domain-${index}`}
                    type="text"
                    maxLength={MAX_DOMAIN_LENGTH}
                    placeholder={t('domainExpiryWidget.domainPlaceholder')}
                    aria-invalid={isInvalid || undefined}
                    value={domain}
                    onChange={(event) => updateRow(index, event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('domainExpiryWidget.removeDomain', {
                      domain: trimmed || String(index + 1),
                    })}
                    onClick={() => removeRow(index)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </div>
                {isInvalid && (
                  <p className="text-xs text-destructive">
                    {t('domainExpiryWidget.invalidDomain')}
                  </p>
                )}
              </div>
            );
          })}
          {rows.length < MAX_DOMAINS && (
            <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-fit">
              <Plus aria-hidden="true" className="size-4" />
              {t('domainExpiryWidget.addDomain')}
            </Button>
          )}
        </div>
        <FieldDescription>{t('domainExpiryWidget.domainsHint')}</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="domain-expiry-warn-days">
          {t('domainExpiryWidget.warnDays')}
        </FieldLabel>
        <Input
          id="domain-expiry-warn-days"
          type="number"
          min={MIN_WARN_DAYS}
          max={MAX_WARN_DAYS}
          step={1}
          value={config.warnDays}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            const nextWarnDays = Number.isNaN(parsed)
              ? DEFAULT_WARN_DAYS
              : Math.min(MAX_WARN_DAYS, Math.max(MIN_WARN_DAYS, parsed));
            onChange({ ...config, warnDays: nextWarnDays });
          }}
        />
        <FieldDescription>{t('domainExpiryWidget.warnDaysHint')}</FieldDescription>
      </Field>
    </>
  );
}

export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetDomainExpiry',
  description: 'pageWidgets.widgetDomainExpiryDesc',
  category: 'monitoring',
  keywords: ['domain', 'rdap', 'whois', 'expiry', 'expiration', 'domínio', 'expiração'],
  defaultConfig: defaultDomainExpiryConfig,
  parse: widgetDomainExpiryWidget.parseConfig,
  View: ({ config }) => <DomainExpiryView config={config as DomainExpiryConfig} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as DomainExpiryConfig} onChange={onChange} />
  ),
  Gallery: () => <Globe aria-hidden="true" />,
  canSubmit: (config) => widgetDomainExpiryWidget.parseConfig(config) !== null,
};
