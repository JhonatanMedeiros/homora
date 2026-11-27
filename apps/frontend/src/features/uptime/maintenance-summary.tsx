import { useEffect, useRef, useState } from 'react';
import { Button } from '@homora/ui/button';
import { formatDateTime, t } from '@/i18n';

type Summary = {
  state: 'pending' | 'insufficient' | 'available' | 'unavailable';
  observedAt: string | null;
  evaluatedAt: string;
  validUntil?: string;
};
export function MaintenanceSummary({
  serviceId,
  windowId,
  now,
}: {
  serviceId: number;
  windowId: number;
  now: number;
}) {
  const [value, setValue] = useState<Summary | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState('loading');
    setValue(null);
    try {
      const response = await fetch(`/api/services/${serviceId}/maintenance/${windowId}/summary`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('unavailable');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') throw new Error('invalid');
      const result = data as Summary;
      if (
        !['pending', 'insufficient', 'available', 'unavailable'].includes(result.state) ||
        !Number.isFinite(Date.parse(result.evaluatedAt)) ||
        (result.observedAt !== null && !Number.isFinite(Date.parse(result.observedAt))) ||
        (['available', 'unavailable'].includes(result.state) &&
          (!result.observedAt ||
            !result.validUntil ||
            !Number.isFinite(Date.parse(result.validUntil))))
      )
        throw new Error('invalid');
      if (!controller.signal.aborted) {
        setValue(result);
        setState('ready');
      }
    } catch {
      if (!controller.signal.aborted) setState('error');
    }
  }
  return (
    <div className="flex basis-full flex-col items-start gap-2 text-sm">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={state === 'loading'}
        onClick={() => void load()}
      >
        {t('maintenanceReview.summary')}
      </Button>
      {state === 'loading' && <p role="status">{t('common.loading')}</p>}
      {state === 'error' && <p role="alert">{t('maintenanceReview.summaryError')}</p>}
      {value && (
        <>
          {((value.validUntil && now > Date.parse(value.validUntil)) ||
            now - Date.parse(value.evaluatedAt) > 120_000) && (
            <p role="status">{t('impactQuery.stale')}</p>
          )}
          <p>
            {value.state === 'pending'
              ? t('maintenanceReview.summaryPending')
              : value.state === 'insufficient'
                ? t('maintenanceReview.summaryInsufficient')
                : t(
                    value.state === 'available'
                      ? 'maintenanceReview.summaryAvailable'
                      : 'maintenanceReview.summaryUnavailable',
                    { time: formatDateTime(value.observedAt!) },
                  )}
          </p>
          <p className="text-xs text-muted-foreground">{t('maintenanceReview.summaryLimit')}</p>
        </>
      )}
    </div>
  );
}
