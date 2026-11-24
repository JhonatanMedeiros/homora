import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff, MapPin, RefreshCw, ShieldAlert } from 'lucide-react';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Checkbox } from '@homora/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@homora/ui/empty';
import { Field, FieldDescription, FieldLabel } from '@homora/ui/field';
import { FormSelect } from '@homora/ui/form-select';
import { SelectItem } from '@homora/ui/select';
import { Skeleton } from '@homora/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@homora/ui/toggle-group';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  PUBLIC_IP_FAMILIES,
  PUBLIC_IP_PROVIDERS,
  defaultPublicIpConfig,
  widgetPublicIpWidget,
  type PublicIpConfig,
  type PublicIpFamily,
  type PublicIpProvider,
} from '../definition.js';
import { maskIpAddress } from '../ip.js';
import { usePublicIpReading, type PublicIpReading } from './use-public-ip-reading.js';

export function PublicIpView({ config }: { config: PublicIpConfig }) {
  const { readSource } = useWidgetHost();
  const reading = usePublicIpReading(config, readSource);
  return <PublicIpContent config={config} reading={reading} />;
}

function IpAddressRow({
  label,
  value,
  family,
  masked,
  unavailable,
  copied,
  onCopy,
}: {
  label: string;
  value: string | null;
  family: 'ipv4' | 'ipv6';
  masked: boolean;
  unavailable: boolean;
  copied: boolean;
  onCopy: (ip: string) => void;
}) {
  const { t } = useWidgetHost();
  const copyLabel = family === 'ipv4' ? t('publicIpWidget.copyIpv4') : t('publicIpWidget.copyIpv6');
  const hiddenLabel =
    family === 'ipv4' ? t('publicIpWidget.hiddenIpv4') : t('publicIpWidget.hiddenIpv6');

  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-card/50 px-2.5 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {value === null || unavailable ? (
          <span className="text-sm text-muted-foreground">{t('publicIpWidget.unavailable')}</span>
        ) : masked ? (
          <span
            className="font-mono text-sm tracking-wider text-muted-foreground"
            aria-label={hiddenLabel}
          >
            {maskIpAddress(family)}
          </span>
        ) : (
          <span className="min-w-0 break-all font-mono text-sm font-medium tabular-nums">
            {value}
          </span>
        )}
      </div>
      {value !== null && !unavailable && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={copied ? t('publicIpWidget.copied') : copyLabel}
          onClick={() => onCopy(value)}
        >
          {copied ? (
            <Check aria-hidden="true" className="size-3.5 text-primary" />
          ) : (
            <Copy aria-hidden="true" className="size-3.5" />
          )}
        </Button>
      )}
    </div>
  );
}

export function PublicIpContent({
  config,
  reading,
}: {
  config: PublicIpConfig;
  reading: PublicIpReading;
}) {
  const { t, locale } = useWidgetHost();
  const [revealed, setRevealed] = useState(!config.maskByDefault);
  const [copiedFamily, setCopiedFamily] = useState<'ipv4' | 'ipv6' | null>(null);
  const copyTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setRevealed(!config.maskByDefault);
  }, [config.maskByDefault]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== undefined) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async (family: 'ipv4' | 'ipv6', value: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      }
      setCopiedFamily(family);
      if (copyTimerRef.current !== undefined) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopiedFamily(null), 2000);
    } catch {
      // Ignore clipboard write errors in restricted contexts.
    }
  };

  if (reading.status === 'opt-in-pending') {
    return (
      <Empty className="gap-2 p-3 md:p-3">
        <EmptyHeader>
          <EmptyMedia>
            <ShieldAlert aria-hidden="true" className="size-5 text-muted-foreground" />
          </EmptyMedia>
          <EmptyDescription className="text-sm">
            {t('publicIpWidget.optInPending')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (reading.status === 'loading') {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('publicIpWidget.loading')}</span>
        <div aria-hidden="true" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-16 motion-reduce:animate-none" />
            <Skeleton className="h-7 w-16 motion-reduce:animate-none" />
          </div>
          <Skeleton className="h-12 w-full motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  if (reading.status === 'policy-blocked') {
    return (
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p role="alert" className="min-w-0 break-words text-sm text-destructive">
          {t('publicIpWidget.policyBlocked')}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={t('publicIpWidget.refresh')}
          onClick={reading.refresh}
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
    );
  }

  if (reading.status === 'error') {
    return (
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p role="alert" className="min-w-0 break-words text-sm text-destructive">
          {t('publicIpWidget.error')}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={t('publicIpWidget.refresh')}
          onClick={reading.refresh}
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
    );
  }

  const { data, stale, refreshing, refresh } = reading;
  const showIpv4 = config.addressFamily === 'ipv4' || config.addressFamily === 'both';
  const showIpv6 = config.addressFamily === 'ipv6' || config.addressFamily === 'both';
  const hasAnyIp = (showIpv4 && data.ipv4 !== null) || (showIpv6 && data.ipv6 !== null);
  const masked = !revealed;

  const formattedTime = new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
  }).format(data.fetchedAt);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="max-w-full truncate font-normal">
            {config.provider}
          </Badge>
          {stale && (
            <span role="status" className="text-xs text-muted-foreground">
              {t('publicIpWidget.stale')}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasAnyIp && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-pressed={revealed}
              aria-label={revealed ? t('publicIpWidget.hide') : t('publicIpWidget.reveal')}
              onClick={() => setRevealed((prev) => !prev)}
            >
              {revealed ? (
                <EyeOff aria-hidden="true" className="size-3.5" />
              ) : (
                <Eye aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={refreshing}
            aria-label={t('publicIpWidget.refresh')}
            onClick={refresh}
          >
            <RefreshCw
              aria-hidden="true"
              className={
                refreshing ? 'size-3.5 animate-spin motion-reduce:animate-none' : 'size-3.5'
              }
            />
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        {showIpv4 && (
          <IpAddressRow
            label={t('publicIpWidget.family.ipv4')}
            value={data.ipv4}
            family="ipv4"
            masked={masked}
            unavailable={data.ipv4 === null}
            copied={copiedFamily === 'ipv4'}
            onCopy={(ip) => void handleCopy('ipv4', ip)}
          />
        )}
        {showIpv6 && (
          <IpAddressRow
            label={t('publicIpWidget.family.ipv6')}
            value={data.ipv6}
            family="ipv6"
            masked={masked}
            unavailable={data.ipv6Unavailable || data.ipv6 === null}
            copied={copiedFamily === 'ipv6'}
            onCopy={(ip) => void handleCopy('ipv6', ip)}
          />
        )}
      </div>

      <p className="truncate text-[11px] text-muted-foreground">
        <time dateTime={new Date(data.fetchedAt).toISOString()}>
          {t('publicIpWidget.lastChecked', { time: formattedTime })}
        </time>
      </p>
    </div>
  );
}

export function Editor({
  config,
  onChange,
}: {
  config: PublicIpConfig;
  onChange: (next: PublicIpConfig) => void;
}) {
  const { t } = useWidgetHost();
  return (
    <>
      <Field>
        <FieldLabel htmlFor="public-ip-provider">{t('publicIpWidget.provider')}</FieldLabel>
        <FormSelect
          id="public-ip-provider"
          aria-label={t('publicIpWidget.provider')}
          value={config.provider}
          onChange={(event) =>
            onChange({ ...config, provider: event.target.value as PublicIpProvider })
          }
        >
          {PUBLIC_IP_PROVIDERS.map((provider) => (
            <SelectItem key={provider} value={`homora-option:${provider}`}>
              {t(`publicIpWidget.provider.${provider}`)}
            </SelectItem>
          ))}
        </FormSelect>
      </Field>

      <Field>
        <FieldLabel>{t('publicIpWidget.addressFamily')}</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label={t('publicIpWidget.addressFamily')}
          value={config.addressFamily}
          onValueChange={(value) => {
            if ((PUBLIC_IP_FAMILIES as readonly string[]).includes(value)) {
              onChange({ ...config, addressFamily: value as PublicIpFamily });
            }
          }}
        >
          {PUBLIC_IP_FAMILIES.map((family) => (
            <ToggleGroupItem key={family} value={family}>
              {t(`publicIpWidget.family.${family}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <Field>
        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox
            id="public-ip-opt-in"
            checked={config.optIn}
            onCheckedChange={(checked) => onChange({ ...config, optIn: checked === true })}
          />
          <span className="leading-snug">{t('publicIpWidget.optIn')}</span>
        </label>
        <FieldDescription>{t('publicIpWidget.optInHint')}</FieldDescription>
      </Field>

      <Field>
        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox
            id="public-ip-mask"
            checked={config.maskByDefault}
            onCheckedChange={(checked) => onChange({ ...config, maskByDefault: checked === true })}
          />
          <span className="leading-snug">{t('publicIpWidget.maskByDefault')}</span>
        </label>
        <FieldDescription>{t('publicIpWidget.maskByDefaultHint')}</FieldDescription>
      </Field>
    </>
  );
}

export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetPublicIp',
  description: 'pageWidgets.widgetPublicIpDesc',
  category: 'utilities',
  keywords: [
    'ip',
    'public ip',
    'ipv4',
    'ipv6',
    'network',
    'wan',
    'ipify',
    'icanhazip',
    'ip público',
    'rede',
  ],
  defaultConfig: defaultPublicIpConfig,
  parse: widgetPublicIpWidget.parseConfig,
  View: ({ config }) => <PublicIpView config={config as PublicIpConfig} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as PublicIpConfig} onChange={onChange} />
  ),
  Gallery: () => <MapPin aria-hidden="true" />,
  canSubmit: (config) => widgetPublicIpWidget.parseConfig(config) !== null,
};
