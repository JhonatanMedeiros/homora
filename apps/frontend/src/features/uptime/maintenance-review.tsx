import { useEffect, useId, useState } from 'react';
import type { Maintenance, Service } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { Checkbox } from '@homora/ui/checkbox';
import { ImpactConsultation } from '@/features/hosts/impact-consultation';
import { formatDateTime, t } from '@/i18n';
import { useNow } from '@/hooks/use-now';

/** Non-persistent, human-reviewed preparation. It never creates or applies a proposal. */
export function MaintenanceReview({
  serviceId,
  services,
  startsAt,
  endsAt,
  excludeId,
}: {
  serviceId: number;
  services?: Pick<Service, 'id' | 'name'>[];
  startsAt?: number;
  endsAt?: number;
  excludeId?: number;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [windows, setWindows] = useState<Maintenance[] | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);
  const now = useNow();
  const [failed, setFailed] = useState(false);
  const [names, setNames] = useState<Pick<Service, 'id' | 'name'>[]>(services ?? []);
  const prefix = useId();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setWindows(null);
    setFailed(false);
    void fetch(`/api/services/${serviceId}/maintenance`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const value: unknown = await response.json();
        if (
          !value ||
          typeof value !== 'object' ||
          !Array.isArray((value as { windows?: unknown }).windows)
        )
          throw new Error('invalid');
        const rows = (value as { windows: unknown[] }).windows;
        if (
          !rows.every(
            (row) =>
              row &&
              typeof row === 'object' &&
              Number.isSafeInteger((row as Maintenance).id) &&
              (row as Maintenance).id > 0 &&
              (row as Maintenance).serviceId === serviceId &&
              Number.isSafeInteger((row as Maintenance).startsAt) &&
              Number.isSafeInteger((row as Maintenance).endsAt) &&
              (row as Maintenance).endsAt >= (row as Maintenance).startsAt,
          )
        )
          throw new Error('invalid');
        return rows as Maintenance[];
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setWindows(data);
          setReadAt(Date.now());
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    if (!services)
      void fetch('/api/services', { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('unavailable');
          const data: unknown = await response.json();
          if (Array.isArray(data) && !controller.signal.aborted)
            setNames(
              data.filter((item: unknown): item is Pick<Service, 'id' | 'name'> =>
                Boolean(
                  item &&
                  typeof item === 'object' &&
                  Number.isSafeInteger((item as Service).id) &&
                  (item as Service).id > 0 &&
                  typeof (item as Service).name === 'string',
                ),
              ),
            );
        })
        .catch(() => {});
    return () => controller.abort();
  }, [open, serviceId, attempt, services]);
  const valid = Number.isFinite(startsAt) && Number.isFinite(endsAt) && endsAt! > startsAt!;
  const overlaps =
    valid &&
    windows?.some(
      (window) => window.id !== excludeId && window.startsAt < endsAt! && window.endsAt > startsAt!,
    );
  return (
    <section
      className="flex flex-col gap-3 rounded-md border p-3"
      aria-label={t('maintenanceReview.title')}
    >
      <h3 className="font-semibold">{t('maintenanceReview.title')}</h3>
      {open ? (
        <>
          <p className="text-sm text-muted-foreground">{t('maintenanceReview.guidance')}</p>
          <ul className="flex flex-col gap-2">
            {(['scope', 'window', 'after'] as const).map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Checkbox id={`${prefix}-${item}`} />
                <label htmlFor={`${prefix}-${item}`} className="text-sm">
                  {t(`maintenanceReview.check.${item}`)}
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t('maintenanceReview.ephemeral')}</p>
          {failed ? (
            <p role="alert">{t('maintenanceReview.loadError')}</p>
          ) : !windows ? (
            <p role="status">{t('common.loading')}</p>
          ) : valid ? (
            <p className="text-sm">
              {t(overlaps ? 'maintenanceReview.overlap' : 'maintenanceReview.noOverlap')}
            </p>
          ) : (
            <p className="text-sm">{t('maintenanceReview.enterWindow')}</p>
          )}
          {windows && readAt !== null && (
            <p className="text-xs text-muted-foreground">
              {t('maintenanceReview.readAt', { time: formatDateTime(readAt) })}
            </p>
          )}
          {windows && readAt !== null && now - readAt > 120_000 && (
            <p role="status">{t('impactQuery.stale')}</p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t('maintenanceReview.refreshWindows')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('maintenanceReview.recheck')}</p>
          <ImpactConsultation
            roots={[
              {
                id: serviceId,
                name: names.find((item) => item.id === serviceId)?.name ?? String(serviceId),
              },
            ]}
            services={names}
            onSelect={(id) => {
              window.location.href = `/services/${id}`;
            }}
          />
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setOpen(true)}
        >
          {t('maintenanceReview.open')}
        </Button>
      )}
    </section>
  );
}
