import { useState } from 'react';
import { CalendarClock, CalendarPlus } from 'lucide-react';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@homora/ui/empty';
import { Field, FieldLabel } from '@homora/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@homora/ui/select';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { RowListSkeleton } from '@/components/skeletons';
import type { BrowseState } from '@/features/dashboard/use-browse-state';
import { useViewPreferences } from '@/features/dashboard/use-view-preferences';
import { HealthPill } from '@/features/home/health-pill';
import { HomeSidebar } from '@/features/home/home-sidebar';
import { useHomeArea } from '@/features/home/use-home-area';
import { MaintenanceDialog } from '@/features/uptime/maintenance-dialog';
import { MaintenanceList } from '@/features/uptime/maintenance-panel';
import { useMinWidth } from '@/hooks/use-min-width';
import { useIsMobile } from '@/hooks/use-mobile';
import type { useServices } from '@/hooks/use-services';
import { t } from '@/i18n';

type Props = {
  data: ReturnType<typeof useServices>;
  browse: BrowseState;
  navigate: (path: string, replace?: boolean) => void;
};

/** Every maintenance window that is open or ahead, and the way to schedule one. */
export function MaintenancePage({ data, browse, navigate }: Props) {
  const { services } = data;
  const { uptimeRange, setArrange } = useViewPreferences();
  const { sources, hostData, model, health, actions, categories } = useHomeArea(
    data,
    browse,
    uptimeRange,
  );
  const mobile = useIsMobile();
  const wide = useMinWidth(1280) && !mobile && services.length > 0;
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const { windows, loaded, failed, reload } = sources.maintenance;
  const { clock } = sources;
  const service = services.find((item) => item.id === serviceId);
  const open = windows.filter((item) => item.startsAt <= clock && item.endsAt > clock);
  const ahead = windows.filter((item) => item.startsAt > clock);
  const nameOf = (id: number) => {
    const found = services.find((item) => item.id === id);
    if (!found) return t('maintview.unknownService');
    return (
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-foreground pointer-coarse:min-h-11"
        onClick={() => navigate(`/services/${id}`)}
      >
        {found.name}
      </Button>
    );
  };
  const toServices = () => {
    setArrange('group');
    navigate('/services');
  };

  const body = (
    <section aria-labelledby="maintenance-title" className="flex min-w-0 flex-col gap-5">
      <HealthPill
        data={data}
        sources={sources}
        health={health}
        impacts={model.impacts}
        range={uptimeRange}
        onService={(id) => navigate(`/services/${id}`)}
        onProbes={() => navigate('/manage/probes')}
        onConnections={() => navigate('/manage/integrations')}
        onAcknowledge={(members, minutes) => void actions.acknowledge(members, minutes)}
      />
      <header className="flex flex-col gap-1">
        <h1 id="maintenance-title" className="text-2xl md:text-3xl">
          {t('maintview.title')}
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">{t('maintview.description')}</p>
      </header>
      {data.loadError ? (
        <LoadErrorAlert message={data.loadError} onRetry={() => void data.refresh()} />
      ) : data.loaded && services.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('maintview.noServices')}</p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (service) setScheduling(true);
          }}
        >
          <Field className="w-full sm:w-72">
            <FieldLabel htmlFor="maintenance-service">{t('maintview.choose')}</FieldLabel>
            <Select
              value={serviceId === null ? '' : String(serviceId)}
              onValueChange={(value) => setServiceId(Number(value))}
            >
              <SelectTrigger id="maintenance-service" className="w-full pointer-coarse:min-h-11">
                <SelectValue placeholder={t('maintview.choosePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {services.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button
            type="submit"
            disabled={!service}
            className="max-sm:w-full pointer-coarse:min-h-11"
          >
            <CalendarPlus aria-hidden="true" />
            {t('maintview.schedule')}
          </Button>
        </form>
      )}
      {service && scheduling && (
        <MaintenanceDialog
          open
          serviceId={service.id}
          serviceName={service.name}
          services={services}
          onOpenChange={setScheduling}
          onScheduled={reload}
        />
      )}
      {failed && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span role="status">{t(loaded ? 'maintview.stale' : 'maint.loadError')}</span>
            <Button type="button" variant="link" size="sm" onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!loaded && !failed && <RowListSkeleton label={t('common.loading')} />}
      {loaded && open.length + ahead.length === 0 && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarClock />
            </EmptyMedia>
            <EmptyTitle className="font-label text-xl">{t('maintview.none')}</EmptyTitle>
            <EmptyDescription>{t('maintview.noneHint')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {(
        [
          ['maintview.now', open],
          ['maintview.next', ahead],
        ] as const
      ).map(
        ([title, items]) =>
          items.length > 0 && (
            <section key={title} aria-label={t(title)} className="flex flex-col gap-2">
              <h2 className="text-base">{t(title)}</h2>
              <MaintenanceList windows={items} now={clock} onChanged={reload} nameOf={nameOf} />
            </section>
          ),
      )}
    </section>
  );
  if (!wide) return body;
  return (
    <div className="grid grid-cols-[13rem_minmax(0,1fr)] gap-6">
      <HomeSidebar
        data={data}
        hostData={hostData}
        health={health}
        browse={browse}
        categories={categories}
        onShowHosts={() => {
          setArrange('host');
          navigate('/services');
        }}
        onProbes={() => navigate('/manage/probes')}
        onChosen={toServices}
      />
      {body}
    </div>
  );
}
